/* Author: yunnuo <ymz@ebox.vip> */
/* NSStatusItem menu-bar tray for the macOS desktop shell; every entry point runs on the main thread. */
#import <Cocoa/Cocoa.h>
#import "tray_darwin.h"

static NSStatusItem *trayStatusItem = nil;

@interface TrayTarget : NSObject
- (void)onOpen:(id)sender;
- (void)onQuit:(id)sender;
@end
static TrayTarget *trayTarget = nil;

@implementation TrayTarget
- (void)onOpen:(id)sender { unicoreTrayOnOpen(); }
- (void)onQuit:(id)sender { unicoreTrayOnQuit(); }
@end

void trayInit(const char *icon, int iconLen, const char *openTitle, const char *quitTitle) {
	NSData *imageData = [NSData dataWithBytes:icon length:(NSUInteger)iconLen];
	NSImage *image = [[NSImage alloc] initWithData:imageData];
	image.size = NSMakeSize(16, 16);
	image.template = YES;
	trayTarget = [TrayTarget new];
	NSMenu *menu = [[NSMenu alloc] init];
	menu.autoenablesItems = NO;
	NSMenuItem *open = [menu addItemWithTitle:[NSString stringWithUTF8String:openTitle] action:@selector(onOpen:) keyEquivalent:@""];
	[open setTarget:trayTarget];
	open.enabled = YES;
	[menu addItem:[NSMenuItem separatorItem]];
	NSMenuItem *quit = [menu addItemWithTitle:[NSString stringWithUTF8String:quitTitle] action:@selector(onQuit:) keyEquivalent:@""];
	[quit setTarget:trayTarget];
	quit.enabled = YES;
	trayStatusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
	trayStatusItem.button.image = image;
	trayStatusItem.menu = menu;
}

const char *traySystemLanguage(void) {
	NSString *code = [[NSLocale currentLocale] languageCode];
	return strdup([code UTF8String]);
}
