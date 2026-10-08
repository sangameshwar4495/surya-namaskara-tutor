# Guided practice milestone

Open **Step-by-step practice → Start Guided Practice** on Android. This milestone covers Prayer Pose and an upright Raised Arms position, not the entire 12-pose sequence or a backbend assessment.

Each step has a three-second preparation countdown and requires five consecutive seconds of accepted posture. A correction resets the hold immediately. A gap longer than 500 ms between detection callbacks also resets it; a timer alone cannot complete a pose. Success appears for 1.5 seconds before the next step. Pause, leaving the screen, and backgrounding restart preparation for the current step. Restart returns to the first pose.

Angles use metric world landmarks. Normalized landmarks are retained for display and relative position checks, using the existing Android orientation transform. Missing world coordinates prevent successful holds rather than falling back to image-space angles.

`src/services/practiceEvaluator.ts` contains initial tolerances for visible joints, upright hips/knees, feet spacing, hand placement, and arm extension. These are engineering starting points, not validated anatomical standards. Wrist proximity approximates hands together; the body landmark model cannot verify palm contact or detailed finger position. Screen-space placement assumes a front-facing, upright camera. Validate and tune using real-device sessions before expanding the pose set.

Run `npm test` for deterministic geometry, processing, evaluation, timer, and advancement checks. Run `npx tsc --noEmit` for type checking.

## Device acceptance checks

1. Frame the entire body, including raised fingertips. Hold Prayer Pose: the counter should reach five seconds and advance once to Raised Arms.
2. Separate the hands, lower them, or bend a knee: the relevant correction should appear and the counter reset. Restore form and verify a fresh full hold is required.
3. Cover the camera or walk out of frame during a hold: progress must not continue. Return and verify recovery.
4. Pause, background the app, or leave and return: no time away should count. Verify the calibration camera is inactive behind practice.
5. Complete Raised Arms and confirm the completion screen, stopped camera, and Practice Again action.
6. Check permission denial/settings recovery, different front-camera aspect ratios, low light, and extended sessions for lag or heat.

Automated checks do not establish device performance or pose-recognition accuracy. Native camera behavior and initial thresholds require phone validation.
