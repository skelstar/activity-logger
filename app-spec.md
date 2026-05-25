# Activity Logger

This app is used to log activities (like runs) that results in a JSON object listing various aspects of the activity. The user enters in information that will ultimately be collected in a JSON object that the user can copy to the clipboard and be pasted in a chat with an AI elsewhere. Later, the acitivity will be stored in a Posgres database.

The app should be mobile first. It should be a React app with an API backend.

## Schema

- Date the run occurred ("Today", "Yesterday" or optional text field)
- Name of the route (dropdown showing options like "Tip Track Commute", "Waimapihi", "Fenceline", also with "other" text field which eventaully will be stored as a new entry)
- Duration (in hours/mins, text-field)
- Amount of vert (in metres, text-field)
- Terrain (ie trails/road/treadmill radio buttons)
- Heartrate:
  - Average (bpm)
  - Max (bpm)
- Hip status (out of 10)
  - Initial (ie 0/10)
  - End (ie 3/10)
  - Behavior (i.e. "stable", "downhill related", as text-field)
- notes (free-form text field)

## Actions

There will be a button that you can click that will copy the information to the clipboard so it can be pasted into a chat.

example:

```
I went for a run today (Monday)
Tip Track Commute
1h52m / 620m
Trail
136 avg / 148 max
Hip 0→2
Stable, downhill-sensitive
Strong finish, could continue
Notes:
Poles helped on descents.
```

## Example JSON

```
{
  "date": "2026-05-25",
  "route": "Tip Track Commute",
  "duration": "1h52m",
  "vert": 620,
  "terrain": "trail",
  "avg_hr": 136,
  "max_hr": 148,
  "hip": {
    "start": 0,
    "end": 2,
    "behaviour": [
      "stable",
      "downhill_related"
    ]
  },
  "recovery": [
    "felt_strong",
    "could_continue"
  ],
  "notes": "Poles helped a lot."
}
```
