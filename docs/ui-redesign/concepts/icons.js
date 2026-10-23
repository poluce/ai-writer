/* AI Writer 概念稿图标精灵：以 document.write 注入，避免每个页面重复 40+ 个 symbol */
document.write(`
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
<defs>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.2 12 3l9 7.2"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.2"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h5l2 2.2h8A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/></symbol>
  <symbol id="i-book" viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5Z"/><path d="M5 17.5h14"/><path d="M9 7h6"/></symbol>
  <symbol id="i-book-open" viewBox="0 0 24 24"><path d="M12 6.5C10 4.5 7 4 3 4v14c4 0 7 .5 9 2.5 2-2 5-2.5 9-2.5V4c-4 0-7 .5-9 2.5Z"/><path d="M12 6.5V20.5"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M16.2 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.5 14.8c2 .6 3.4 2.2 3.9 4.7"/></symbol>
  <symbol id="i-branch" viewBox="0 0 24 24"><path d="M6 4v10.5"/><circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="6.5" r="2.5"/><path d="M18 9v1.5a5 5 0 0 1-5 5H8.5"/></symbol>
  <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.3 4 5.3 4 8.5s-1.4 6.2-4 8.5c-2.6-2.3-4-5.3-4-8.5s1.4-6.2 4-8.5Z"/></symbol>
  <symbol id="i-sparkles" viewBox="0 0 24 24"><path d="m12 4 1.8 4.6 4.6 1.8-4.6 1.8L12 16.8l-1.8-4.6L5.6 10.4l4.6-1.8Z"/><path d="m18.5 15.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/></symbol>
  <symbol id="i-checks" viewBox="0 0 24 24"><path d="m3.5 7 1.5 1.5L7.5 6"/><path d="m3.5 16 1.5 1.5L7.5 15"/><path d="M11 7.5h9"/><path d="M11 16h9"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v5h5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h5"/></symbol>
  <symbol id="i-cpu" viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v2.5M15 2v2.5M9 19.5V22M15 19.5V22M2 9h2.5M2 15h2.5M19.5 9H22M19.5 15H22"/></symbol>
  <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.04Z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5L19.5 7"/></symbol>
  <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
  <symbol id="i-square" viewBox="0 0 24 24"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-chev-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-chev-right" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="i-chevrons-left" viewBox="0 0 24 24"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/></symbol>
  <symbol id="i-send" viewBox="0 0 24 24"><path d="m21 3-9.5 9.5"/><path d="M21 3l-6.5 18-3-8.5L3 9.5Z"/></symbol>
  <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2 3.5 13.5h7L9.5 22 21 10.5h-7.5Z"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M5.5 3.5h10l3 3V20a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M8 3.5V8h7V3.5"/><path d="M8 20.5V14h8v6.5"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-archive" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/></symbol>
  <symbol id="i-panel-right" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/></symbol>
  <symbol id="i-pen" viewBox="0 0 24 24"><path d="M4 20h4.2L20 8.2a2.1 2.1 0 0 0-3-3L5.2 17Z"/><path d="M14.5 6.7 17.3 9.5"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5 17.5 12 8 18.5Z"/></symbol>
  <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 3c3.5 4 6 6.8 6 10a6 6 0 0 1-12 0c0-2 1-3.6 2.5-5.2C10 6.3 11 4.7 12 3Z"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3v5M16 3v5M4 10.5h16"/></symbol>
  <symbol id="i-keyboard" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></symbol>
  <symbol id="i-arrow-up" viewBox="0 0 24 24"><path d="M12 20V5"/><path d="m6 11 6-6 6 6"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5"/></symbol>
  <symbol id="i-rotate" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/></symbol>
  <symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 5h16l-6.5 8v6l-3 1.5v-7.5Z"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/></symbol>
  <symbol id="i-message" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4Z"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-activity" viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 5 12 2.5-6H21"/></symbol>
  <symbol id="i-trending-up" viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></symbol>
  <symbol id="i-circle-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 5-5"/></symbol>
  <symbol id="i-loader" viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M21 12h-3M6 12H3m13.4-6.4-2.1 2.1M8.7 15.3l-2.1 2.1m10.8 0-2.1-2.1M8.7 8.7 6.6 6.6"/></symbol>
  <symbol id="i-corner" viewBox="0 0 24 24"><path d="M20 5v7a3 3 0 0 1-3 3H6"/><path d="m10 11-4 4 4 4"/></symbol>
  <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></symbol>
  <symbol id="i-palette" viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.9 1.9-1.9 0-.6-.2-1-.6-1.5-.4-.4-.6-.8-.6-1.3 0-1 .8-1.8 1.8-1.8h1.6a4.4 4.4 0 0 0 4.4-4.4c0-3.4-3.8-6.1-8.5-6.1Z"/><circle cx="8" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="14" r="1" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-map" viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/></symbol>
  <symbol id="i-note" viewBox="0 0 24 24"><path d="M4 5h16v10l-4 5H4Z"/><path d="M16 20v-5h4"/><path d="M8 9h8M8 12.5h5"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></symbol>
  <symbol id="i-columns" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 4.5v15"/></symbol>
  <symbol id="i-maximize" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></symbol>
  <symbol id="i-commit" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M2.5 12h6M15.5 12h6"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></symbol>
  <symbol id="i-thread" viewBox="0 0 24 24"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="18" r="2"/></symbol>
<symbol id="i-pause" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></symbol>
<symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5"/></symbol>
<symbol id="i-handoff" viewBox="0 0 24 24"><path d="M3 8h11M11 5l3 3-3 3"/><path d="M21 16H10M13 13l-3 3 3 3"/></symbol>
<symbol id="i-broadcast" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2"/></symbol>
<symbol id="i-merge" viewBox="0 0 24 24"><path d="M7 4v5a4 4 0 0 0 4 4h6"/><path d="m14 10 3 3-3 3"/><path d="M7 20v-3"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4.5 6v5c0 4.5 3 8 7.5 10 4.5-2 7.5-5.5 7.5-10V6Z"/><path d="m9 12 2 2 4-4"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3Z"/><path d="M12 14v7"/></symbol>
<symbol id="i-scissors" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7.8 20 19M8.2 16.2 20 5"/></symbol>
</defs>
</svg>`)
