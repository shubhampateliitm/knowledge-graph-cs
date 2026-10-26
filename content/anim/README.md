# Animated scenes (content/anim/*.json)

A scene is a short animated explanation of one mechanism, drawn as SVG and played step by step in the concept's read
(play, pause, next, back, speed). Use it where motion explains what text cannot: messages between machines, data moving
between memory and disk, a structure changing shape, a pipeline filling. Each file holds a JSON list of scenes.

    {"id": "raft-election",            unique scene id (kebab-case)
     "concept": "raft",                concept id this scene belongs to (python3 tools/kg_ids.py)
     "title": "A leader election",     short title
     "w": 720, "h": 400,               viewBox size (defaults 720 x 400); keep everything inside it
     "groups": [ {"id":"disk","label":"Disk","x":20,"y":250,"w":680,"h":130} ],   labelled background regions
     "actors": [ {"id":"n1","label":"Node 1","sub":"follower","x":120,"y":80,"w":120,"h":56,
                  "shape":"box"} ],    shape: box | round | circle | db | cell | note   (x,y = top-left)
     "links":  [ {"from":"n1","to":"n2","label":"","dashed":false} ],   arrows always shown
     "steps": [                         4–14 steps; each step animates from the previous state
       {"say": "One sentence explaining this step (what happens and why).",
        "msgs": [ {"from":"n1","to":"n2","label":"RequestVote(term=2)","tone":"accent","lost":false} ],
        "set":  { "n1": {"label":"Node 1","sub":"candidate, term 2","tone":"accent"} },
        "move": { "k7": {"x":300,"y":280} },
        "add":  [ {"id":"k7","label":"k7","x":300,"y":120,"w":40,"h":30,"shape":"cell"} ],
        "remove": ["k3"],
        "link": [ {"from":"a","to":"b","label":"","dashed":true} ], "unlink": [ ["a","b"] ],
        "focus": ["n1"] } ] }

- tone: normal | accent | ok | bad | muted | warn. msgs animate a dot travelling from one actor to another with the
  label; "lost": true makes it vanish halfway (packet loss). "focus" highlights actors for that step only.
- Every step must change something visible. Captions: plain English, one or two sentences, real numbers where useful.
- Coordinates: plan a clean layout first (rows/columns); labels up to ~18 characters per actor; no overlaps.
- Validate: python3 tools/checkanim.py content/anim/<file>.json
