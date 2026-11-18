# Real-Time Yoga Pose Correction

A mobile yoga practice application built with **React Native, Expo, and MediaPipe**. Choose a pose, follow the demonstration, and receive movement guidance from your camera's body-landmark measurements.

The application compares your movement with learned reference trajectories using **Dynamic Time Warping (DTW)**. The pose is selected before practice; the system does not need to classify which yoga pose you are performing.

## Download the Android app

Try the app on your Android device without setting up the development environment:

**[Download the Android APK from Expo](https://expo.dev/accounts/sangamesh18/projects/yoga-pose-correction/builds/6fb4a783-f6b3-4a89-87f5-9749ac47647d)**

1. Open the build page above on your Android device and download the APK.
2. Open the downloaded file. If Android prompts you, allow installation from the browser or file manager you used.
3. Install and launch the app, grant camera permission, and select a pose to begin practice.

The APK is for Android devices. To run the project from source or contribute changes, follow the setup instructions below.

## Supported poses

| Pose | Practice reference |
| --- | --- |
| Tadasana | Standing movement with arms raised overhead |
| Vrikshasana | Tree pose with hands together at chest level; either supporting leg |
| Trikasana | Side-bending movement; either side |
| Bhujasana | Cobra movement, viewed from beside the mat |

Dataset names are retained in the application. Other variations, such as Vrikshasana with overhead arms, may not be supported by the bundled references.

## Features

- Live camera preview with a body-landmark overlay.
- Bundled demonstration videos for guided practice.
- Continuous movement tracking and a separate final-hold check.
- Pose-specific feedback for supported, observable arm, elbow and knee deviations.
- Persistent-error filtering to reduce reactions to brief tracking noise.
- Anatomical body-part highlighting and prioritized written corrections.
- Spoken guidance with repeated-message suppression.
- Attempt summaries that distinguish final-pose completion from observed entry movement.
- Development diagnostics for phase, joint measurements, visibility and feedback decisions.

## Technology stack

| Area | Technologies |
| --- | --- |
| Mobile application | React Native 0.81, React 19, TypeScript |
| Application framework | Expo SDK 54, Expo Router |
| Camera | React Native Vision Camera |
| Body tracking | MediaPipe Pose Landmarker Lite, `react-native-mediapipe-posedetection` |
| Landmark overlay | React Native SVG |
| Demonstrations and speech | Expo Video, Expo Speech |
| Movement modeling | DTW, robust reference statistics, geometric rules |
| Offline dataset processing | Python, MediaPipe, OpenCV, NumPy |
| Training and evaluation | Node.js scripts and Python utilities |
| Automated checks | Node.js test runner, TypeScript compiler |

## How it works

```text
Select a pose
     ↓
Camera → MediaPipe body landmarks → Joint angles and geometric measurements
     ↓
Compare with the selected pose's learned trajectory
     ↓
Estimate movement phase and assess observable deviations
     ↓
Filter persistent errors → Prioritize guidance → Highlight and speak
     ↓
Verify final hold and summarize the attempt
```

Training uses correct demonstrations, DTW alignment, robust statistics and video-level calibration. Runtime tracking allows different movement speeds without requiring a hold at every intermediate position. Holding the final pose does not automatically prove that the full entry movement was observed or correct.

## Prerequisites

For the Android application, install:

- **Node.js 22 LTS** and npm. The installed React Native version requires Node.js **20.19.4 or newer**.
- **Git**.
- **JDK 17**.
- **Android Studio**, Android SDK, platform tools and the SDK/build tools requested by Expo's Android build.
- A physical Android device with USB debugging enabled, or an Android emulator for basic UI checks.

A physical device is recommended for camera-based practice. Ensure `JAVA_HOME` and your Android SDK environment variables are configured and `adb` is available on your PATH. See the [Expo local development setup guide](https://docs.expo.dev/get-started/set-up-your-environment/) for platform-specific instructions.

**Use a native Android build for pose correction.** The camera and MediaPipe integrations are native modules and are not available in ordinary Expo Go. Web preview is not a substitute for the native camera pipeline. iOS scripts are present, but iOS camera behavior has not been verified for this implementation.

## Fork and install

1. Open [surya-namaskara-tutor on GitHub](https://github.com/sangameshwar4495/surya-namaskara-tutor).
2. Click **Fork** to create a copy in your own account. This implementation originates from the **`diffposes2`** branch; include that branch when creating your fork.
3. Clone your fork. Replace `YOUR_USERNAME` with your GitHub username:

   ```bash
   git clone --branch diffposes2 https://github.com/YOUR_USERNAME/surya-namaskara-tutor.git
   cd surya-namaskara-tutor
   npm ci
   ```

   If your fork stores this implementation on a differently named branch, use that branch instead.

The repository includes the MediaPipe model, learned reference artifacts and demonstration clips. **You do not need the original training dataset or Python to run the application with the bundled models.**

## Run on Android

1. Connect your device, enable USB debugging, and accept the debugging authorization prompt. Confirm that it is visible:

   ```bash
   adb devices
   ```

2. Build and install the native application:

   ```bash
   npm run android
   ```

   Expo generates the Android project when needed, builds the application and starts the development server. The first build may take several minutes while Gradle downloads dependencies.

3. For later JavaScript-only development sessions, start the development server and open the installed application:

   ```bash
   npm start
   ```

   Rebuild with `npm run android` after changing native dependencies or native configuration.

4. Grant camera permission, open **Practice yoga poses**, select a pose, and start your movement after the setup instructions and countdown.

For standing poses, place the camera so your full body remains visible. For Bhujasana, position it beside the mat. Use even lighting and enough space for the movement. Development builds offer **Show diagnostics** on the practice screen.

Local Android builds do not require an EAS cloud build. If you later configure EAS for your fork, link it to your own Expo project instead of using the original project's `extra.eas.projectId` in `app.json`.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Expo development server |
| `npm run android` | Build and run the native Android app |
| `npm test` | Run automated behavioral and regression tests |
| `npx tsc --noEmit` | Check TypeScript types |
| `npx expo start --clear` | Restart Metro with a cleared cache |

## Project structure

```text
app/                      Expo Router screens and navigation
src/
  components/             Camera overlays and demonstration components
  hooks/                  Pose detection, speech and camera lifecycle
  services/               Tracking, measurements, classification and feedback
  data/                   Learned references, pose metadata and demo mappings
  types/                  Shared TypeScript types
assets/
  models/                 MediaPipe Pose Landmarker model
  demos/                  Bundled demonstration videos
ml/                       Dataset review, training and evaluation utilities
tests/                    Automated tests
```

Generated native projects, local datasets, feature caches and evaluation reports are excluded from Git by the existing `.gitignore`.

## Optional: dataset processing and training

Python is needed only when working on the offline ML pipeline. Use **Python 3.11** with a virtual environment and the pinned dependencies:

**Windows PowerShell**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt
```

**macOS / Linux**

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r ml/requirements.txt
```

Original recordings are not included in a Git clone. Dataset utilities expect recordings under `dataset/train/<Pose>/` and `dataset/test/<Pose>/`; training and evaluation scripts also require the corresponding local manifest and extracted caches.

Read [the ML documentation](ml/README.md), [evaluation notes](ml/RESULTS.md), and the [implementation report](IMPLEMENTATION_REPORT.md) before regenerating artifacts. Some legacy bulk scripts still cover an additional pose; the current coaching work focuses on the four listed above. Review correctness, movement boundaries and variants before including recordings, keep test recordings separate, and preserve source videos.

With the required reviewed data and caches available:

```bash
node ml/train-relationships.cjs
node ml/diagnose.cjs --mistakes --rows
node ml/evaluate-coaching.cjs
```

These commands respectively fit the supplemental arm relationship, run the synthetic-mistake benchmark, and compare baseline and updated coaching. They are not required for normal app setup.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Native module missing in Expo Go | Install the native build using `npm run android` |
| Device not listed | Check the USB cable, debugging authorization and `adb devices` |
| Android build cannot find Java or the SDK | Check JDK 17, `JAVA_HOME`, Android Studio SDK installation and SDK environment variables |
| App cannot connect to Metro | Keep the device and computer on an accessible network; for USB development, try `adb reverse tcp:8081 tcp:8081` |
| Camera permission denied | Enable camera permission in Android application settings |
| Tracking is intermittent | Improve lighting and keep the relevant arm/leg landmarks fully visible |
| Changes are not appearing | Restart with `npx expo start --clear`; rebuild after native changes |
| Training scripts report missing files | Obtain the required local dataset, reviewed manifest and caches; a Git clone excludes them |

## Validation and current limits

The documented local implementation passes **105 automated tests** and TypeScript checking. Tests include persistence, tracking loss, anatomical side handling, supported corrections, and final-hold behavior.

Real-world mistake-detection accuracy remains unvalidated. Current results show fewer live corrections on some correct demonstrations, but not a uniform improvement across all evaluation measures. Camera viewpoint, occlusion and unsupported movement variants can affect assessment. Additional torso and foot-placement corrections require calibrated geometric references. Android-device behavior still requires direct testing of this revision.

See the [implementation report](IMPLEMENTATION_REPORT.md) for exact baseline comparisons, dataset inclusion counts and remaining work.

## Contributing

Fork the repository, make a focused change on your own branch, and run `npm test` and `npx tsc --noEmit`. Include reproduction steps and validation results when proposing a change. For camera or tracking changes, describe the device, camera orientation and pose variant used. Keep private recordings, generated caches and local reports out of commits.
