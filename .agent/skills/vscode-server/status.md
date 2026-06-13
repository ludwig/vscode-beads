# Status Action

Check the status of the container and host watch mode without starting anything.

```bash
just dev status
```

For a fuller snapshot (host build state + container + every mounted project's
Dolt mode, without needing `docker inspect`):

```bash
just dev info
```

For a deeper check that embedded `bd` works in the container:

```bash
just dev verify
```

Report the output to the user.
