"""
Gesture-based media controller using MediaPipe Hands and OpenCV.
To run well: 
MM_TARGET_APP="Electron" .venv/bin/python finger.py 
"""

import cv2
# Import compatibility module first to patch mediapipe
import mediapipe_compat
import mediapipe as mp
import time
import os
import platform
import subprocess
from urllib import request, error

try:
    import pyautogui
except Exception:
    pyautogui = None

mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands
##################################
tipIds = [4, 8, 12, 16, 20]
state = None
Gesture = None
wCam, hCam = 720, 640
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
############################
def fingerPosition(image, handNo=0):
    lmList = []
    if results.multi_hand_landmarks:
        myHand = results.multi_hand_landmarks[handNo]
        for id, lm in enumerate(myHand.landmark):
            # print(id,lm)
            h, w, c = image.shape
            cx, cy = int(lm.x * w), int(lm.y * h)
            lmList.append([id, cx, cy])
    return lmList
# For webcam input:
cap = cv2.VideoCapture(0)
cap.set(3, wCam)
cap.set(4, hCam)
with mp_hands.Hands(
    min_detection_confidence=0.8,
    min_tracking_confidence=0.5) as hands:
  while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("Ignoring empty camera frame.")
        continue
    # Flip the image horizontally for a later selfie-view display, and convert
    # the BGR image to RGB.
    image = cv2.cvtColor(cv2.flip(image, 1), cv2.COLOR_BGR2RGB)
    image.flags.writeable = False
    results = hands.process(image)
    # Draw the hand annotations on the image.
    image.flags.writeable = True
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    if results.multi_hand_landmarks:
      for hand_landmarks in results.multi_hand_landmarks:
        mp_drawing.draw_landmarks(
            image, hand_landmarks, mp_hands.HAND_CONNECTIONS)
    lmList = fingerPosition(image)
    #print(lmList)
    if len(lmList) != 0:
        fingers = []
        for id in range(1, 5):
            if lmList[tipIds[id]][2] < lmList[tipIds[id] - 2][2]:
                #state = "Play"
                fingers.append(1)
            if (lmList[tipIds[id]][2] > lmList[tipIds[id] - 2][2] ):
               # state = "Pause"
               # pyautogui.press('space')
               # print("Space")
                fingers.append(0)
        totalFingers = fingers.count(1)
        current_sign, pending_action, state = detect_sign_and_action(lmList, totalFingers, state)
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
    #cv2.putText(image, str("Gesture"), (10,40), cv2.FONT_HERSHEY_SIMPLEX,
     #              1, (255, 0, 0), 2)
    cv2.imshow("Media Controller", image)
    key = cv2.waitKey(1) & 0xFF
    # if the `q` key was pressed, break from the loop
    if key == ord("q"):
        break
  cv2.destroyAllWindows()
  cap.release()
