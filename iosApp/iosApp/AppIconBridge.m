#import <UIKit/UIKit.h>
#include <stdbool.h>

typedef void (*NuvioAppIconCompletion)(bool);

bool NuvioSupportsAlternateAppIcons(void) {
    return UIApplication.sharedApplication.supportsAlternateIcons;
}

bool NuvioIsCurrentAlternateAppIcon(const char *name) {
    NSString *currentName = UIApplication.sharedApplication.alternateIconName;
    if (name == NULL) {
        return currentName == nil;
    }
    return [currentName isEqualToString:[NSString stringWithUTF8String:name]];
}

void NuvioSetAlternateAppIconName(const char *name, NuvioAppIconCompletion completion) {
    NSString *iconName = name == NULL ? nil : [NSString stringWithUTF8String:name];
    void (^changeIcon)(void) = ^{
        UIApplication *application = UIApplication.sharedApplication;
        if (!application.supportsAlternateIcons) {
            if (completion != NULL) {
                completion(false);
            }
            return;
        }
        [application setAlternateIconName:iconName completionHandler:^(NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (completion != NULL) {
                    completion(error == nil);
                }
            });
        }];
    };
    if (NSThread.isMainThread) {
        changeIcon();
    } else {
        dispatch_async(dispatch_get_main_queue(), changeIcon);
    }
}
