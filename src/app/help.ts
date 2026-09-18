/** The built-in keyboard reference, written in the format the app renders. */
export const HELP_DOCUMENT = `# Keyboard shortcuts

## Files

| Shortcut | Action |
| --- | --- |
| \`Ctrl\` \`O\` / \`Ctrl\` \`T\` | Open a file in a new tab |
| \`Ctrl\` \`R\` / \`F5\` | Reload the current file |
| \`Alt\` \`←\` / \`Alt\` \`→\` | Back / forward within this tab |
| \`Alt\` \`↑\` / \`Alt\` \`↓\` | Previous / next file in the same folder |
| \`Ctrl\` \`Shift\` \`E\` | Export as standalone HTML |
| \`Ctrl\` \`P\` | Print |

## Tabs

Every file opens in its own tab, and the strip under the toolbar is restored
the next time MDX starts. Links followed inside a document stay in the tab they
were opened from, so each tab keeps its own back and forward history.

| Shortcut | Action |
| --- | --- |
| \`Ctrl\` \`W\` | Close the current tab |
| \`Ctrl\` \`Tab\` / \`Ctrl\` \`Shift\` \`Tab\` | Next / previous tab |
| \`Ctrl\` \`1\`…\`8\` | Jump to that tab |
| \`Ctrl\` \`9\` | Jump to the last tab |
| Middle click | Close a tab |

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
| \`Ctrl\` \`+\` / \`Ctrl\` \`-\` | Zoom in / out |
| \`Ctrl\` + mouse wheel | Zoom in / out |
| \`Ctrl\` \`0\` | Reset zoom |
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
