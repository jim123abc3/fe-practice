import { useEffect, useState, useSyncExternalStore } from "react";
import { Box, Typography, Paper, Divider, Button } from "@mui/material";

/**
 * Three classic React footguns. Each component below is DELIBERATELY BROKEN.
 * Your job: reproduce the bug in the browser, then refactor each to fix it.
 * Keep them small - the point is being able to explain the fix live.
 */

// ---------------------------------------------------------------------------
// 1. STALE CLOSURE  -  freezes at 1
// ---------------------------------------------------------------------------
// The interval callback closes over `count` from the first render (0) and
// never sees later values, so it forever computes 0 + 1.
// Fix three ways, know when each applies:
//   - functional updater setCount(c => c + 1)  (when you only WRITE)
//   - add count to the dep array               (when the effect should re-run)
//   - latest-ref pattern                       (read fresh inside a long-lived
//     subscription - same as your useIntersectionObserver)
function StaleClosureDemo() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCount((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return <Typography>Count: {count} (should climb, freezes at 1)</Typography>;
}

// ---------------------------------------------------------------------------
// 2. ZOMBIE CHILD  -  crashes on "Delete selected"
// ---------------------------------------------------------------------------
// Select a user, then delete it. `selected` becomes undefined, but the detail
// child reads `user.name` unguarded and throws. The `!` is the lie that lets
// it compile.
// Fix: guard (if (!user) return null), or don't render detail with no
// selection. Structural fix: child looks the user up by id from a source that
// tolerates absence, rather than being handed a maybe-dead object.
interface User {
  id: number;
  name: string;
}

function ZombieChildDemo() {
  const [users, setUsers] = useState<User[]>([
    { id: 1, name: "Ada" },
    { id: 2, name: "Bob" },
    { id: 3, name: "Cy" },
  ]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = users.find((u) => u.id === selectedId);

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        {users.map((u) => (
          <Button
            key={u.id}
            variant={u.id === selectedId ? "contained" : "outlined"}
            onClick={() => setSelectedId(u.id)}
          >
            {u.name}
          </Button>
        ))}
        <Button
          color="error"
          onClick={() =>
            setUsers((prev) => prev.filter((u) => u.id !== selectedId))
          }
        >
          Delete selected
        </Button>
      </Box>
      {selected && <ZombieDetail user={selected} />}
    </Box>
  );
}

function ZombieDetail({ user }: { user: User }) {
  return <Typography>Selected: {user.name}</Typography>;
}

// ---------------------------------------------------------------------------
// 3. TORN READS / useSyncExternalStore
// ---------------------------------------------------------------------------
// This subscribes to an external store the WRONG way (useState + useEffect).
// Updates that fire between the first render and the effect running are missed,
// and it can read stale values under concurrent rendering.
// Fix: replace the useState + useEffect with
//   const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
// Talking point: that's what Zustand / Nanostores use internally.
let storeValue = 0;
const listeners = new Set<() => void>();
const store = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot() {
    return storeValue;
  },
  increment() {
    storeValue += 1;
    listeners.forEach((l) => l());
  },
};

function TornReadsDemo() {
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
      <Typography>Value: {value}</Typography>
      <Button variant="outlined" onClick={() => store.increment()}>
        Increment
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Divider sx={{ mb: 2 }} />
      {children}
    </Paper>
  );
}

export default function DemosPage() {
  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        React footgun demos
      </Typography>

      <Section title="1. Stale closure">
        <StaleClosureDemo />
      </Section>

      <Section title="2. Zombie child">
        <ZombieChildDemo />
      </Section>

      <Section title="3. Torn reads / useSyncExternalStore">
        <TornReadsDemo />
      </Section>
    </Box>
  );
}
