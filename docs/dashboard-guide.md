# Yes2Games Dashboard: Studio Guide

Welcome to the Yes2Games Dashboard. This is where you bring your game through Yes2Games' validation process: upload your build, fill in the details, check your integration in the Inspector, and request review. The Yes2Games team takes it from there.

This guide walks you through the flow.

## The Onboarding Flow

Every game moves through four short stages. The **Onboarding** tab on your game page shows exactly where you are and unlocks the next stage as you progress.

### Stage 1: Quick Start

The minimum to register a game: a **title** and a **validated build zip**.

1. Click **New Game**
2. Enter a title
3. Drag & drop your build `.zip` (max 500 MB, `index.html` at the root)
4. The dashboard automatically checks your SDK integration and detects your engine. You'll see a green check when the build is good
5. Click **Create Game**

If the SDK isn't integrated yet, the upload is rejected and you'll be pointed at the integration guide for your engine. Fix the build, then try again. We never leave half-created games behind.

You can upload new builds any time from the **Versions** tab on the game page.

### Stage 2: Game Profile

Fill in the public details of your game:

- **Icon**: 512×512 PNG recommended
- **Description**: short plain-text pitch
- **Category**: Action, Puzzle, Strategy, Racing, Sports, RPG, Casual, Simulation, or Adventure
- **Tags**: up to five, comma-separated

Click **Save profile** when you're done. You can edit everything later.

> Banner and extra screenshots live in the **Assets** tab. They're useful but not required to unlock Stage 3.

### Stage 3: QA Check

Open the **Inspector** and run a test of your build. Yes2SDK intercepts every call and runs a set of integration checks live. When you end the session, the results save to your game automatically. The Onboarding tab shows passes, warnings, and failures at a glance.

This is the single most important stage: a build that doesn't pass QA can't be submitted for review. If you've tested once, there's also a **Manual override** button to mark the check as passed yourself.

See [QA Inspector](#qa-inspector) below for details.

### Stage 4: Request Review

When Stage 3 is green, Stage 4 unlocks.

1. Pick one of your builds (it must have been tested in the Inspector at least once)
2. Tell us about your game: gameplay, target audience, what makes it unique
3. Submit the request

You'll get a notification as the request moves through review, and the Onboarding tab shows the current status.

---

## QA Inspector

The Inspector is a sandboxed player for your game with full visibility into every SDK call. It's also where you capture screenshots.

### Layout

- **Left**: QA Modules checklist and Mock Controls
- **Center**: your game running in a viewport
- **Right**: real-time event log

### QA Modules

Each module is an automated check:

- SDK initialized
- Loading progress reported
- Gameplay lifecycle (start / stop) called
- Ad pause / resume behavior
- Build size within limits
- Viewport responsiveness (after a Scaling Test pass)

Your results are saved with the build. Next time you open the Inspector you pick up where you left off.

### Event Log

Every SDK call appears live with a timestamp, the method, parameters, and the result. If something isn't working, this is the first place to look.

### Mock Controls

Toggle mock responses to test edge cases without leaving the Inspector:

- Ad fills and no-fills
- Sign-in success and failure
- Data save and load scenarios

### Viewport

A resizable area running your game. Use **Restart** to reload with a clean event log. Use **Scaling Tests** to sweep through a set of viewport sizes and confirm your layout holds up.

### Screenshots

Capture screenshots from the viewport with one click. They land in your game's Assets tab and appear in the Overview carousel.

### Bottom bar

- **Scaling Tests**: multi-viewport layout check
- **Restart**: reload the game, clear the log
- **End Session**: return to your game page

### Standalone mode

If you just want to test a zip without creating a game yet, go to **Inspector** from the top nav. Upload a zip, run it through the checks. When you're ready to make it official, **Save as Game** promotes it into a real game entry.

---

## Managing Your Game

The game detail page is organized into tabs:

### Onboarding

The four-stage flow. This is where you spend most of your time: it tells you exactly what's left to do and hands you the controls to do it (rename, save profile, open Inspector, request review).

### Overview

A quick summary of the game: icon, description, screenshot carousel, review status.

### Versions

Every build you've uploaded, newest first. Each row has a status badge, a **Preview** link for a quick visual check, and a link to open the build in the **Inspector**. You can upload a new build from here at any time.

### Assets

Manage your **icon**, **banner** (1200×630 PNG recommended), and **screenshots**. Delete any individual screenshot you don't want. Screenshots can also be captured straight from the Inspector.

---

## Review & Feedback

When you request review, your submission lands in the Yes2Games review queue.

- **Approved**: your game is ready, and the Yes2Games team takes it from there
- **Changes Requested**: read the feedback, make the changes, upload a new build, submit that build for review
- **Rejected**: read the feedback; if you want to resubmit, address the issues and upload a new build

Each review request has its own **Feedback** thread. Your comments appear on the right, Yes2Games team messages on the left. It's a normal chat. Use it freely.

A build flagged as rejected or needs-changes can't be re-submitted as-is. Upload a fresh build and submit that one.

---

## Your Team

If your studio has multiple members, the **Team** page lets owners and managers add or remove teammates and set their role:

- **Owner**: full access, manages the team and settings
- **Manager**: edit the game, manage the team
- **Developer**: upload builds, edit game info, run the Inspector
- **Viewer**: read-only

Every teammate sees the same games, but what they can do depends on their role.

---

## Troubleshooting

**Upload fails.** Check that your zip contains `index.html` at the root (not inside a subfolder) and that the zip isn't corrupted. Very large zips take longer to process. Give it a moment.

**Stage 3 won't turn green.** Open the build in the Inspector and go through the QA Modules list one at a time. The event log shows you exactly which calls fired (or didn't) during init, loading, and gameplay. Use **Restart** to reload the game without losing your session.

**Inspector can't load the game.** Try the **Restart** button. If that doesn't help, check the event log for loading errors or network failures, then re-upload the build.

**Blank or transparent screenshots.** Make sure the game is fully loaded and actively rendering before you capture. Loading screens with transparent canvases sometimes don't capture cleanly. Grab your screenshots during actual gameplay.

**Icon or banner not updating after upload.** The dashboard cache-busts automatically; a hard refresh (Cmd/Ctrl + Shift + R) clears any local browser cache if needed.
