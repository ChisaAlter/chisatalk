import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, "children" | "onPressIn" | "onPressOut" | "style"> {
  children?: ReactNode;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  pressScale?: number;
  staticMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  children,
  disabled,
  onPressIn,
  onPressOut,
  pressScale = 0.96,
  staticMotion = false,
  style,
  ...props
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const shouldAnimate = !disabled && !staticMotion;

  const animateTo = useCallback(
    (value: number) => {
      scale.stopAnimation();
      Animated.timing(scale, {
        toValue: value,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  useEffect(() => {
    if (disabled) {
      animateTo(1);
    }
  }, [animateTo, disabled]);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (shouldAnimate) {
        animateTo(pressScale);
      }
      onPressIn?.(event);
    },
    [animateTo, onPressIn, pressScale, shouldAnimate],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (shouldAnimate) {
        animateTo(1);
      }
      onPressOut?.(event);
    },
    [animateTo, onPressOut, shouldAnimate],
  );

  return (
    <AnimatedPressableBase
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, shouldAnimate ? { transform: [{ scale }] } : null]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
