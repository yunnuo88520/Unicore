/* Bridge between tray_darwin.go and tray_darwin.m. */
void trayInit(const char *icon, int iconLen, const char *openTitle, const char *quitTitle);
const char *traySystemLanguage(void);
extern void unicoreTrayOnOpen(void);
extern void unicoreTrayOnQuit(void);
