"""
Compatibility module to add mediapipe.solutions for older API compatibility.
This patches mediapipe to expose the solutions module for Python 3.13+.
"""

import sys
import importlib
import os
from types import ModuleType

# Create a mock solutions module structure
def _create_solutions_module():
    """Create a compatibility solutions module that provides hands and drawing_utils."""

    # Create a simple mock that will work for basic hand detection
    class MockHands:
        "Mock Hands class for basic compatibility"
        def __init__(self, **kwargs):
            self.params = kwargs

        def __enter__(self):
            # Try to import the real HandLandmarker
            try:
                from mediapipe.tasks.python import vision
                from mediapipe.tasks import python as mp_python
                model_path = os.environ.get("MP_HAND_LANDMARKER_MODEL")
                if not model_path:
                    local_candidates = [
                        os.path.join(os.getcwd(), "hand_landmarker.task"),
                        os.path.join(os.getcwd(), "models", "hand_landmarker.task")
                    ]
                    for candidate in local_candidates:
                        if os.path.exists(candidate):
                            model_path = candidate
                            break

                if not model_path or not os.path.exists(model_path):
                    raise FileNotFoundError(
                        "Missing hand_landmarker model. Set MP_HAND_LANDMARKER_MODEL "
                        "or place hand_landmarker.task in project root/models."
                    )

                self.base_options = mp_python.BaseOptions(model_asset_path=model_path)
                self.options = vision.HandLandmarkerOptions(
                    base_options=self.base_options,
                    num_hands=2,
                    min_hand_detection_confidence=self.params.get('min_detection_confidence', 0.5),
                    min_hand_presence_confidence=self.params.get('min_tracking_confidence', 0.5)
                )
                self.detector = vision.HandLandmarker.create_from_options(self.options)
            except Exception as e:
                print(f"Warning: Could not initialize HandLandmarker: {e}")
                self.detector = None
            return self

        def __exit__(self, *args):
            if self.detector:
                try:
                    self.detector.close()
                except:
                    pass

        def process(self, image):
            if not self.detector:
                return type('obj', (object,), {'multi_hand_landmarks': []})()

            try:
                from mediapipe import Image, ImageFormat
                import numpy as np

                # Convert to MediaPipe Image format
                if isinstance(image, np.ndarray):
                    mp_image = Image(image_format=ImageFormat.SRGB, data=image)
                else:
                    mp_image = image

                results = self.detector.detect(mp_image)

                # Convert to old API format
                class LegacyResults:
                    def __init__(self, hand_landmarks):
                        self.multi_hand_landmarks = hand_landmarks

                class LegacyHandLandmarks:
                    def __init__(self, landmarks):
                        self.landmark = landmarks

                converted = [LegacyHandLandmarks(hand) for hand in results.hand_landmarks]
                return LegacyResults(converted)
            except Exception as e:
                print(f"Error in process: {e}")
                return type('obj', (object,), {'multi_hand_landmarks': []})()

    class MockLandmark:
        def __init__(self, x, y, z):
            self.x = x
            self.y = y
            self.z = z

    class MockDrawingUtils:
        @staticmethod
        def draw_landmarks(image, hand_landmarks, connections):
            """Mock drawing - just returns the image unchanged."""
            return image

    class MockHandConnections:
        # Just a placeholder
        HAND_CONNECTIONS = []

    # Create solutions module
    solutions = ModuleType('solutions')
    solutions.Hands = MockHands
    solutions.drawing_utils = MockDrawingUtils
    HAND_CONNECTIONS = []
    setattr(MockHands, 'HAND_CONNECTIONS', HAND_CONNECTIONS)

    return solutions


# Patch mediapipe when this module is imported
import mediapipe as mp

if not hasattr(mp, 'solutions'):
    mp.solutions = _create_solutions_module()
    # Also add HAND_CONNECTIONS to the mock
    mp.solutions.hands = type('Hands', (),{
        'Hands': mp.solutions.Hands,
        'HAND_CONNECTIONS': []
    })()
