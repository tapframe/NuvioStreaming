#import <React/RCTViewManager.h>
#import <AVKit/AVRoutePickerView.h>

@interface AirPlayRoutePickerViewManager : RCTViewManager
@end

@implementation AirPlayRoutePickerViewManager

// Expose as `AirPlayRoutePickerView` for `requireNativeComponent`
RCT_EXPORT_MODULE(AirPlayRoutePickerView)

- (UIView *)view
{
  AVRoutePickerView *picker = [AVRoutePickerView new];
  picker.backgroundColor = UIColor.clearColor;
  if (@available(iOS 11.0, *)) {
    picker.tintColor = UIColor.whiteColor;
    picker.activeTintColor = UIColor.whiteColor;
  }
  return picker;
}

@end
