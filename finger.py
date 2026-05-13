"""
Gesture-based media controller using MediaPipe Hands and OpenCV.
To run well:
MM_TARGET_APP="Electron" .venv/bin/python finger.py
"""

import os
import platform
import subprocess
import time
from shutil import which
from urllib import request

import cv2
# Import compatibility module first to patch mediapipe
import mediapipe_compat  # noqa: F401
import mediapipe as mp

try:
    from picamera2 import Picamera2
except Exception as err:
    PICAMERA2_IMPORT_ERROR = err
    Picamera2 = None
else:
    PICAMERA2_IMPORT_ERROR = None

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
HAND_DETECTION_CONFIDENCE = float(os.environ.get("MM_HAND_DETECTION_CONFIDENCE", "0.6"))
HAND_TRACKING_CONFIDENCE = float(os.environ.get("MM_HAND_TRACKING_CONFIDENCE", "0.5"))
GESTURE_DEBUG = os.environ.get("MM_GESTURE_DEBUG", "0") == "1"
GESTURE_DEBUG_INTERVAL = int(os.environ.get("MM_GESTURE_DEBUG_INTERVAL", "20"))
last_action = {"left": 0.0, "right": 0.0, "up": 0.0, "down": 0.0, "space": 0.0}
ACTION_COOLDOWN = 0.7
last_sign = None
TARGET_APP_NAME = os.environ.get("MM_TARGET_APP", "MagicMirror")
MM_BASE_URL = os.environ.get("MM_BASE_URL", "http://127.0.0.1:8080")
MM_CAROUSEL_MODULE = os.environ.get("MM_CAROUSEL_MODULE", "MMM-Carousel")
DIRECT_CAROUSEL_ENABLED = os.environ.get("MM_DIRECT_CAROUSEL", "0") == "1"
KEY_FALLBACK_ENABLED = os.environ.get("MM_KEY_FALLBACK", "1") == "1"
LINUX_KEY_TOOL = os.environ.get("MM_LINUX_KEY_TOOL", "auto").strip().lower()
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
    wtype_key = {
        "left": "Left",
        "right": "Right",
        "up": "Up",
        "down": "Down",
        "space": "space"
    }.get(key_name)
    if xdotool_key is None:
        return False

    if LINUX_KEY_TOOL in {"auto", "xdotool"} and which("xdotool"):
        title_patterns = [
            TARGET_APP_NAME,
            "MagicMirror",
            "MagicMirror²",
            "Electron",
            "electron"
        ]
        unique_titles = []
        for title in title_patterns:
            if title and title not in unique_titles:
                unique_titles.append(title)
        try:
            for title in unique_titles:
                search = subprocess.run(
                    ["xdotool", "search", "--name", title],
                    check=False,
                    capture_output=True,
                    text=True
                )
                if search.returncode != 0 or not search.stdout.strip():
                    continue
                window_id = search.stdout.strip().splitlines()[0].strip()
                if not window_id:
                    continue
                subprocess.run(
                    ["xdotool", "windowactivate", "--sync", window_id],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                key_result = subprocess.run(
                    ["xdotool", "key", "--window", window_id, xdotool_key],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                if key_result.returncode == 0:
                    return True

            # Last resort: send to currently focused window.
            key_result = subprocess.run(
                ["xdotool", "key", xdotool_key],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return key_result.returncode == 0
        except Exception:
            pass

    if LINUX_KEY_TOOL == "wtype" and bool(os.environ.get("WAYLAND_DISPLAY")) and which("wtype") and wtype_key:
        try:
            result = subprocess.run(
                ["wtype", "-k", wtype_key],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            if result.returncode == 0:
                return True
        except Exception:
            pass

    return False


def try_press(key_name):
    now = time.monotonic()
    last = last_action.get(key_name, 0.0)
    if (now - last) < ACTION_COOLDOWN:
        return
    if DIRECT_CAROUSEL_ENABLED:
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


def detect_sign_and_action(lm_list, total_fingers, current_state, frame_width, frame_height):
    sign = f"{total_fingers}_FINGERS"
    action = None
    new_state = current_state
    # Position thresholds relative to current frame size.
    x_left_threshold = int(frame_width * 0.42)
    x_right_threshold = int(frame_width * 0.58)
    y_up_threshold = int(frame_height * 0.42)
    y_down_threshold = int(frame_height * 0.58)

    if total_fingers == 4:
        new_state = "Play"
        sign = "PLAY_SIGN"
    elif total_fingers == 0 and current_state == "Play":
        new_state = "Pause"
        sign = "PAUSE_SIGN"
        action = "space"
    elif total_fingers == 1:
        if lm_list[8][1] < x_left_threshold:
            sign = "LEFT_SIGN"
            action = "left"
        elif lm_list[8][1] > x_right_threshold:
            sign = "RIGHT_SIGN"
            action = "right"
    elif total_fingers == 2:
        if lm_list[9][2] < y_up_threshold:
            sign = "UP_SIGN"
            action = "up"
        elif lm_list[9][2] > y_down_threshold:
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
    is_linux_arm = platform.system() == "Linux" and platform.machine() in {
        "aarch64", "armv7l", "armv6l"
    }
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
        if is_linux_arm:
            # On Raspberry Pi/libcamera, /dev/video0 is often a raw Unicam node.
            # /dev/video14 and /dev/video15 are ISP output nodes and usually safer for OpenCV.
            indexes = [CAMERA_INDEX, 14, 15, 12, 0, 1, 2]
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
        if PICAMERA2_IMPORT_ERROR is not None:
            print(f"Picamera2 import failed: {PICAMERA2_IMPORT_ERROR}")
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

    prefer_picamera2_first = (
        backend == "auto"
        and platform.system() == "Linux"
        and platform.machine() in {"aarch64", "armv7l", "armv6l"}
    )

    if prefer_picamera2_first:
        camera = _open_picamera2_camera()
        if camera is not None:
            return camera

    if backend in {"auto", "opencv"}:
        camera = _open_opencv_camera()
        if camera is not None:
            return camera
        if backend == "opencv":
            raise RuntimeError(
                "Failed to open camera with OpenCV backend. "
                "Set MM_CAMERA_BACKEND=picamera2 to force Picamera2."
            )

    if backend in {"auto", "picamera2"} and not prefer_picamera2_first:
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
            max_num_hands=1,
            min_detection_confidence=HAND_DETECTION_CONFIDENCE,
            min_tracking_confidence=HAND_TRACKING_CONFIDENCE
        ) as hands:
            frame_counter = 0
            while True:
                success, image = camera.read()
                if not success or image is None:
                    print("Ignoring empty camera frame.")
                    continue
                frame_counter += 1

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
                        lm_list, total_fingers, state, image.shape[1], image.shape[0]
                    )
                    if GESTURE_DEBUG and frame_counter % GESTURE_DEBUG_INTERVAL == 0:
                        print(
                            f"[debug] fingers={total_fingers} sign={current_sign} "
                            f"index_tip=({lm_list[8][1]}, {lm_list[8][2]}) "
                            f"w={image.shape[1]} h={image.shape[0]}"
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
                    if GESTURE_DEBUG and frame_counter % GESTURE_DEBUG_INTERVAL == 0:
                        print("[debug] no hand landmarks detected")
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
