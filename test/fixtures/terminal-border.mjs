process.stdout.write("\x1b[2J\x1b[H┌── Input ──┐\r\n│ prompt    │\r\n└───────────┘");
// Many redraws without changing the border push its original bytes out of the
// transcript ring. Replaying that ring cannot reconstruct the visible frame.
process.stdout.write("\x1b[5;1HREDRAW".repeat(50000));
process.stdout.write("\x1b[5;1HBORDER_READY\x1b[2;4H");
process.stdin.resume();
