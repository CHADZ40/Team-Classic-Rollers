# Face service

Finds faces in a camera frame and turns each one into an embedding, for attendance check-in. The admin's Attendance page sends frames through `backend/attendance.js`, which does the matching and saves the results.

The service stores nothing and only listens on `127.0.0.1`. If it's down, attendance can still be marked by hand.

## Setup

Needs Python 3.9 or newer. Uses about 240 MB of memory.

```bash
cd backend/face-service
./setup.sh
pm2 start ../ecosystem.config.cjs --only tcr-face
pm2 save
```

The camera only works over HTTPS, or on `localhost` during development.

To run it locally, use `.venv/bin/python app.py`. The first start can take about 15 seconds.

## Models

| Job | Model | License |
| --- | --- | --- |
| Find faces | YuNet | MIT |
| Recognize faces | SFace | Apache 2.0 |

### Why SFace

Measured on LFW, with 3,000 pairs and the same detector and alignment for each model:

| Model | Accuracy | Size | Time per face | License |
| --- | --- | --- | --- | --- |
| InsightFace `w600k_r50` | 99.87% | 174 MB | 22 ms | Needs a license from InsightFace |
| SFace | 99.53% | 38 MB | 5 ms | Apache 2.0 |
| AuraFace | 99.40% | 261 MB | 35 ms | Apache 2.0 |

InsightFace is the most accurate, but its pretrained models are for non-commercial research unless licensed. It stays available as an option:

1. Get a license from InsightFace.
2. Run `./setup.sh arcface`.
3. Set `FACE_MODEL: "arcface"` in `ecosystem.config.cjs`, and raise `max_memory_restart` to `700M` because it uses about 440 MB.
4. Register every member again, because embeddings from different models can't be compared. The admin shows who needs it.

## Tuning

Each frame's best match lands in one of three groups:

| Score | Result |
| --- | --- |
| At or above strong, with a clear lead over the next person | Marked present after 3 sightings within 8 seconds |
| Between unsure and strong | The admin is asked |
| Below unsure | Not recognized |

The default limits came from a simulation on LFW: 40 registered people with 8 saved views each, plus strangers. For a single frame, SFace with strong at 0.55 gave:

| | Result |
| --- | --- |
| Members marked correctly | 99.1% |
| Members marked as someone else | 0.01% |
| Strangers matched as a member | 0.25% |

**Treat these as a starting point.** LFW is mostly photos of well-known Western adults, not your members, your lighting or your camera. Try it at the lanes before relying on it, and see how it does with your members in particular.

Change the limits in `backend/.env`, then restart the backend:

| Setting | SFace default | If you see this |
| --- | --- | --- |
| `FACE_STRONG_MATCH` | 0.55 | Raise it if anyone gets marked as the wrong person. Lower it if the admin is asked about too many members. |
| `FACE_UNSURE_MATCH` | 0.42 | Raise it if strangers cause too many questions. |
| `FACE_SAME_PERSON` | 0.36 | Lower it if a registration scan rejects the same person when they turn their head. |

## Check-in photos

Each face check-in saves one head-and-shoulders photo of that person with the session, so admins can see who was checked in. Only that person is cropped, not the whole frame.

- They're saved in a private `checkin-photos` folder beside the other member data, never in the public uploads.
- Only signed-in admins can view them, from the session's roster.
- They're deleted when the check-in is undone or the session is deleted, and automatically after `CHECKIN_PHOTO_DAYS` (90 by default).
- Members agree to this when they register their face.

Set `CHECKIN_PHOTO_DAYS=0` in `backend/.env` to stop saving them.

## Limits

There's no check that a face is a real person, so a clear photo of a member could be matched. The admin running the session should keep an eye on the camera.
