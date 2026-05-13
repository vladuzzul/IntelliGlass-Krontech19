"""
Gesture-based media controller using MediaPipe Hands and OpenCV.
To run well:
MM_TARGET_APP="Electron" .venv/bin/python finger.py
"""

import os
import platform
import subprocess
import time
from urllib import request

import cv2
# Import compatibility module first to patch mediapipe
import mediapipe_compat  # noqa: F401
import mediapipe as mp

try:
    from picamera2 import Picamera2
except Exception:
    Picamera2 = None

try:
    import pyautogui
except Exception:
    pyautogui = None

mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands

tipIds = [4, 8, 12, 16, 20]
state = None
wCam = int(os.environ.get("MM_CAMERA_WIDTH", "720"))
hCam = int(os.environ.get("MM_CAMERA_HEIGHT", "640"))
CAMERA_BACKEND = os.environ.get("MM_CAMERA_BACKEND", "auto").strip().lower()
CAMERA_INDEX = int(os.environ.get("MM_CAMERA_INDEX", "0"))
SHOW_CAMERA_WINDOW = os.environ.get("MM_SHOW_CAMERA_WINDOW", "1") == "1"
CAMERA_INIT_WAIT = float(os.environ.get("MM_CAMERA_INIT_WAIT", "0.25"))
last_action = {"left": 0.0, "right": 0.0, "up": 0.0, "down": 0.0, "space": 0.0}
ACTION_COOLDOWN = 0.7
last_sign = None
TARGET_APP_NAME = os.environ.get("MM_TARGET_APP", "MagicMirror")
MM_BASE_URL = os.environ.get("MM_BASE_URL", "http://127.0.0.1:8080")
MM_CAROUSEL_MODULE = os.environ.get("MM_CAROUSEL_MODULE", "MMM-Carousel")
KEY_FALLBACK_ENABLED = os.environ.get("MM_KEY_FALLBACK", "1") == "1"
stable_sign = None
stable_frames = 0
STABLE_FRAMES_REQUIRED = 3
last_dispatched_sign = None

MAC_KEY_CODES = {
    "left": 123,
    "right": 124,
    "down": 125,
    "up": 126,
    "space": 49
}


class OpenCVCamera:
    def __init__(self, cap, index):
        self.cap = cap
        self.index = index

    def read(self):
        return self.cap.read()

    def release(self):
        self.cap.release()


class Picamera2Camera:
    def __init__(self, picam2):
        self.picam2 = picam2

    def read(self):
        try:
            frame = self.picam2.capture_array()
            if frame is None:
                return False, None
            if frame.ndim == 3 and frame.shape[2] == 4:
                frame = frame[:, :, :3]
            return True, frame
        except Exception as err:
            print(f"Picamera2 capture error: {err}")
            return False, None

    def release(self):
        try:
            self.picam2.stop()
        except Exception:
            pass
        try:
            self.picam2.close()
        except Exception:
            pass


def _send_carousel_action(action):
    urls = [
        f"{MM_BASE_URL}/api/module/{MM_CAROUSEL_MODULE}/{action}",
        f"{MM_BASE_URL.rstrip('/')}/api/module/{MM_CAROUSEL_MODULE}/{action}"
    ]
    for url in urls:
        try:
            with request.urlopen(url, timeout=0.7) as resp:
                ok = 200 <= resp.status < 300
                if ok:
                    print(f"Sent carousel action: {action} -> {url}")
                    return True
        except Exception:
            continue
    return False


def _send_macos_key(key_name):
    key_code = MAC_KEY_CODES.get(key_name)
    if key_code is None:
        return False
    script = (
        f'tell application "{TARGET_APP_NAME}" to activate\n'
        f'tell application "System Events" to key code {key_code}'
    )
    subprocess.run(["osascript", "-e", script], check=False)
    return True


def _send_linux_key(key_name):
    xdotool_key = {
        "left": "Left",
        "right": "Right",
        "up": "Up",
        "down": "Down",
        "space": "space"
    }.get(key_name)
    if xdotool_key is None:
        return False
    try:
        # Best-effort: focus a Chromium/Electron window first, then send key.
        subprocess.run(
            ["xdotool", "search", "--name", TARGET_APP_NAME, "windowactivate"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        subprocess.run(["xdotool", "key", xdotool_key], check=False)
        return True
    except Exception:
        return False


def try_press(key_name):
    now = time.monotonic()
    last = last_action.get(key_name, 0.0)
    if (now - last) < ACTION_COOLDOWN:
        return
    # Preferred path on Raspberry Pi and kiosk setups: direct module API.
    if key_name == "right" and _send_carousel_action("next"):
        last_action[key_name] = now
        return
    if key_name == "left" and _send_carousel_action("previous"):
        last_action[key_name] = now
        return
    if not KEY_FALLBACK_ENABLED:
        print(
            f"Carousel API send failed for '{key_name}'. "
            "Set MM_KEY_FALLBACK=1 to enable keyboard fallback."
        )
        return
    sent = False
    if platform.system() == "Darwin":
        sent = _send_macos_key(key_name)
    elif platform.system() == "Linux":
        sent = _send_linux_key(key_name)
    if not sent and platform.system() == "Darwin":
        sent = _send_macos_key(key_name)
    if not sent:
        if pyautogui is not None:
            pyautogui.press(key_name)
        else:
            print("Keyboard fallback unavailable: pyautogui is not installed.")
            return
    last_action[key_name] = now
    print(f"Sent key: {key_name} -> app: {TARGET_APP_NAME}")


def detect_sign_and_action(lm_list, total_fingers, current_state):
    sign = f"{total_fingers}_FINGERS"
    action = None
    new_state = current_state

    if total_fingers == 4:
        new_state = "Play"
        sign = "PLAY_SIGN"
    elif total_fingers == 0 and current_state == "Play":
        new_state = "Pause"
        sign = "PAUSE_SIGN"
        action = "space"
    elif total_fingers == 1:
        if lm_list[8][1] < 300:
            sign = "LEFT_SIGN"
            action = "left"
        elif lm_list[8][1] > 400:
            sign = "RIGHT_SIGN"
            action = "right"
    elif total_fingers == 2:
        if lm_list[9][2] < 210:
            sign = "UP_SIGN"
            action = "up"
        elif lm_list[9][2] > 230:
            sign = "DOWN_SIGN"
            action = "down"

    return sign, action, new_state


def finger_position(image, detection_results, hand_no=0):
    lm_list = []
    if detection_results.multi_hand_landmarks:
        my_hand = detection_results.multi_hand_landmarks[hand_no]
        for landmark_id, lm in enumerate(my_hand.landmark):
            h, w, _ = image.shape
            cx, cy = int(lm.x * w), int(lm.y * h)
            lm_list.append([landmark_id, cx, cy])
    return lm_list


def _parse_camera_indexes():
    raw_indexes = os.environ.get("MM_CAMERA_INDEXES")
    if raw_indexes:
        indexes = []
        for token in raw_indexes.split(","):
            token = token.strip()
            if not token:
                continue
            try:
                indexes.append(int(token))
            except ValueError:
                print(f"Ignoring invalid camera index '{token}' from MM_CAMERA_INDEXES.")
    else:
        indexes = [CAMERA_INDEX, 0, 1, 2]

    unique = []
    for index in indexes:
        if index not in unique:
            unique.append(index)
    return unique


def _open_opencv_camera():
    indexes = _parse_camera_indexes()
    for index in indexes:
        backend = getattr(cv2, "CAP_V4L2", None)
        if platform.system() == "Linux" and backend is not None:
            cap = cv2.VideoCapture(index, backend)
        else:
            cap = cv2.VideoCapture(index)

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, wCam)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, hCam)
        if not cap.isOpened():
            cap.release()
            continue

        ok, frame = cap.read()
        if ok and frame is not None:
            print(f"Camera backend: OpenCV (index {index})")
            return OpenCVCamera(cap, index)

        cap.release()
    return None


def _open_picamera2_camera():
    if Picamera2 is None:
        return None

    try:
        picam2 = Picamera2()
        config = picam2.create_preview_configuration(
            main={"size": (wCam, hCam), "format": "BGR888"}
        )
        picam2.configure(config)
        picam2.start()

        # Enable continuous autofocus on Camera Module 3 when controls are available.
        try:
            from libcamera import controls

            picam2.set_controls({"AfMode": controls.AfModeEnum.Continuous})
        except Exception:
            pass

        time.sleep(CAMERA_INIT_WAIT)
        frame = picam2.capture_array()
        if frame is None:
            picam2.stop()
            return None
        print("Camera backend: Picamera2")
        return Picamera2Camera(picam2)
    except Exception as err:
        print(f"Picamera2 init failed: {err}")
        return None


def create_camera():
    backend = CAMERA_BACKEND
    if backend not in {"auto", "opencv", "picamera2"}:
        print(f"Invalid MM_CAMERA_BACKEND='{backend}', falling back to auto.")
        backend = "auto"

    if backend in {"auto", "opencv"}:
        camera = _open_opencv_camera()
        if camera is not None:
            return camera
        if backend == "opencv":
            raise RuntimeError(
                "Failed to open camera with OpenCV backend. "
                "Set MM_CAMERA_BACKEND=picamera2 to force Picamera2."
            )

    if backend in {"auto", "picamera2"}:
        camera = _open_picamera2_camera()
        if camera is not None:
            return camera
        if backend == "picamera2":
            raise RuntimeError(
                "Failed to open camera with Picamera2 backend. "
                "Check python3-picamera2/python3-libcamera and camera ribbon connection."
            )

    raise RuntimeError(
        "No camera backend could be initialized. "
        "Try MM_CAMERA_BACKEND=picamera2 on Raspberry Pi Camera Module 3."
    )


def main():
    global state
    global last_sign
    global stable_sign
    global stable_frames
    global last_dispatched_sign

    try:
        camera = create_camera()
    except RuntimeError as err:
        print(err)
        raise SystemExit(1)

    try:
        with mp_hands.Hands(
            min_detection_confidence=0.8,
            min_tracking_confidence=0.5
        ) as hands:
            while True:
                success, image = camera.read()
                if not success or image is None:
                    print("Ignoring empty camera frame.")
                    continue

                # Flip for selfie view, then convert BGR->RGB for MediaPipe.
                image = cv2.cvtColor(cv2.flip(image, 1), cv2.COLOR_BGR2RGB)
                image.flags.writeable = False
                results = hands.process(image)

                # Draw the hand annotations on a BGR image.
                image.flags.writeable = True
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
                if results.multi_hand_landmarks:
                    for hand_landmarks in results.multi_hand_landmarks:
                        mp_drawing.draw_landmarks(
                            image, hand_landmarks, mp_hands.HAND_CONNECTIONS
                        )

                lm_list = finger_position(image, results)
                if len(lm_list) != 0:
                    fingers = []
                    for finger_id in range(1, 5):
                        if lm_list[tipIds[finger_id]][2] < lm_list[tipIds[finger_id] - 2][2]:
                            fingers.append(1)
                        if lm_list[tipIds[finger_id]][2] > lm_list[tipIds[finger_id] - 2][2]:
                            fingers.append(0)

                    total_fingers = fingers.count(1)
                    current_sign, pending_action, state = detect_sign_and_action(
                        lm_list, total_fingers, state
                    )
                    if current_sign == stable_sign:
                        stable_frames += 1
                    else:
                        stable_sign = current_sign
                        stable_frames = 1

                    if current_sign != last_sign:
                        print(f"Detected sign: {current_sign}")
                        last_sign = current_sign
                        if last_dispatched_sign is not None and current_sign != last_dispatched_sign:
                            last_dispatched_sign = None

                    if stable_frames == STABLE_FRAMES_REQUIRED:
                        print(f"Stable sign confirmed: {current_sign}")
                        if pending_action is not None and current_sign != last_dispatched_sign:
                            try_press(pending_action)
                            print(f"Action fired: {pending_action}")
                            last_dispatched_sign = current_sign
                else:
                    last_dispatched_sign = None

                if SHOW_CAMERA_WINDOW:
                    cv2.imshow("Media Controller", image)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord("q"):
                        break
    except KeyboardInterrupt:
        print("Stopping gesture controller.")
    finally:
        if SHOW_CAMERA_WINDOW:
            cv2.destroyAllWindows()
        camera.release()


if __name__ == "__main__":
    main()
