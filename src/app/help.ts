/** The built-in keyboard reference, written in the format the app renders. */
export const HELP_DOCUMENT = `# Keyboard shortcuts

## Files

| Shortcut | Action |
| --- | --- |
| \`Ctrl\` \`O\` | Open a file |
| \`Ctrl\` \`R\` / \`F5\` | Reload the current file |
| \`Alt\` \`←\` / \`Alt\` \`→\` | Back / forward through visited files |
| \`Alt\` \`↑\` / \`Alt\` \`↓\` | Previous / next file in the same folder |
| \`Ctrl\` \`Shift\` \`E\` | Export as standalone HTML |
| \`Ctrl\` \`P\` | Print |

## Reading

| Shortcut | Action |
| --- | --- |
| \`Ctrl\` \`F\` | Find in document |
| \`Enter\` / \`Shift\` \`Enter\` | Next / previous match |
| \`Ctrl\` \`\\\` | Toggle the contents sidebar |
| \`Ctrl\` \`K\` | Filter the contents sidebar |
| \`Home\` / \`End\` | Jump to top / bottom |
| \`Space\` / \`Shift\` \`Space\` | Page down / up |

## Appearance

| Shortcut | Action |
| --- | --- |
| \`Ctrl\` \`Shift\` \`T\` | Cycle theme |
| \`Ctrl\` \`+\` / \`Ctrl\` \`-\` | Larger / smaller text |
| \`Ctrl\` \`0\` | Reset text size |
| \`F11\` | Fullscreen |
| \`?\` | This page |

## Running it fast

MDX keeps one process. Opening a second file reuses the window that is already
warm, so only the first launch pays for starting the webview.

To keep a process resident from login, install the user service:

\`\`\`bash
systemctl --user enable --now mdx.service
\`\`\`

After that, \`mdx notes.md\` hands the file to the running instance.
`;
