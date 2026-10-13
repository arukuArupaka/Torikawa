import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from '../context/MotionPreferenceContext';
import type { AnimatedDisclosureProps } from './AnimatedDisclosure';

/** CSS grid follows content size changes without measuring or fixing the expanded height. */
export function AnimatedDisclosure({ expanded, header, children, contentStyle }: AnimatedDisclosureProps) {
  const reduceMotion = useReducedMotion();
  const [opened, setOpened] = useState(expanded);
  useEffect(() => { if (expanded) setOpened(true); }, [expanded]);
  return <View>
    {header}
    <div aria-hidden={!expanded} inert={!expanded} style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr',
      transition: reduceMotion ? 'none' : 'grid-template-rows 260ms cubic-bezier(0.2, 0, 0, 1)' }}>
      <div style={{ minHeight: 0, overflow: 'hidden', visibility: expanded ? 'visible' : 'hidden',
        transition: reduceMotion ? 'none' : expanded ? 'visibility 0s' : 'visibility 0s 260ms' }}>
        {expanded || opened ? <View style={contentStyle}>{children}</View> : null}
      </div>
    </div>
  </View>;
}
