# Hands-on practice links (content/handson/*.txt)

Every concept read can end with **Practice it yourself**: places on the web to try the idea (playgrounds, simulators,
puzzle and exercise sets, autograded labs, CTFs, katas, datasets). Free and open-source first.

One line per link, 7 fields separated by " | ":

    concept-id | kind | Title | Who (org or author) | url | access | What you do there, in one plain sentence.

- kind: playground, simulator, puzzles, exercises, lab, ctf, game, dataset, kata
- access: open-source, free, free-tier (a commercial free tier only when nothing open exists)
- At most 4 links per concept. Check every URL with curl before adding it. Lines starting with "#" are comments.

The build (`python3 tools/build.py --check`) validates every line.
