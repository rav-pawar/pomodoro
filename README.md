# Pomodoro Planner

A lightweight in-browser Pomodoro timer that tracks completed focus sessions on a morning timeline from 8:00 AM to 12:00 PM.

## Getting started

Open `index.html` in any modern browser. Session progress and duration preferences are stored in `localStorage`, so completed Pomodoros for the day and your chosen timings stay visible if you refresh the page.

## Features

- Configurable focus, short break, and long break durations with automatic long breaks every fourth session.
- Start, pause/resume, reset, and automatic phase switching between focus and breaks.
- Morning timeline styled like a day calendar that highlights how many Pomodoros were completed each hour between 8 AM and noon.
- Local persistence for both timeline history (per day) and your preferred session lengths.
