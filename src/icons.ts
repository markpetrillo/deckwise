const paths: Record<string, string> = {
  practice: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  deck: '<path d="M7 5 4 6a2 2 0 0 0-1 2l3 12a2 2 0 0 0 2 1l3-1"/><rect x="9" y="3" width="12" height="17" rx="2"/><path d="M15 9v5m-2-2h4"/>',
  progress: '<path d="M5 19V12m7 7V7m7 12V3"/>',
  settings: '<path d="m9 3-.6 2.3-2 .9-2.1-.7-1.5 2.6 1.7 1.7-.2 2.2L3 13.5l1.5 2.6 2.3-.5 1.7 1.4.4 2.5h3l.7-2.3 2-.9 2.1.7 1.5-2.6-1.7-1.7.2-2.2 2-1.5-1.5-2.6-2.3.5-1.7-1.4-.4-2.5Z"/><circle cx="11" cy="11.3" r="3"/>',
  trash: '<path d="M4 7h16m-13 0 1 14h8l1-14M9 7V3h6v4m-4 4v6m3-6v6"/>',
};
export const uiIcon = (name: string) => '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
