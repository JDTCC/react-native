/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

import type {PressEvent} from '../Types/CoreEventTypes';
import type {HostRef} from './getInspectorDataForViewAtPoint';

import View from '../Components/View/View';
import StyleSheet from '../StyleSheet/StyleSheet';
import Dimensions from '../Utilities/Dimensions';
import ElementBox from './ElementBox';
import * as React from 'react';

const {findNodeHandle} = require('../ReactNative/RendererProxy');
const getInspectorDataForViewAtPoint = require('./getInspectorDataForViewAtPoint');

const {useEffect, useState, useCallback, useRef} = React;

const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

export default function DevtoolsOverlay({
  inspectedView,
}: {
  inspectedView: ?HostRef,
}): React.Node {
  const [inspected, setInspected] = useState<null | {
    frame: {+height: any, +left: any, +top: any, +width: any},
  }>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const devToolsAgentRef = useRef(null);

  useEffect(() => {
    let devToolsAgent = null;
    let hideTimeoutId = null;

    function onAgentHideNativeHighlight() {
      // we wait to actually hide in order to avoid flicker
      clearTimeout(hideTimeoutId);
      hideTimeoutId = setTimeout(() => {
        setInspected(null);
      }, 100);
    }

    function onAgentShowNativeHighlight(node: any) {
      clearTimeout(hideTimeoutId);
      // Shape of `node` is different in Fabric.
      const component = node.canonical ?? node;
      if (!component) {
        return;
      }

      component.measure((x, y, width, height, left, top) => {
        setInspected({
          frame: {left, top, width, height},
        });
      });
    }

    function cleanup() {
      const currentAgent = devToolsAgent;
      if (currentAgent != null) {
        currentAgent.removeListener(
          'hideNativeHighlight',
          onAgentHideNativeHighlight,
        );
        currentAgent.removeListener(
          'showNativeHighlight',
          onAgentShowNativeHighlight,
        );
        currentAgent.removeListener('shutdown', cleanup);
        currentAgent.removeListener(
          'startInspectingNative',
          onStartInspectingNative,
        );
        currentAgent.removeListener(
          'stopInspectingNative',
          onStopInspectingNative,
        );
        devToolsAgent = null;
      }
      devToolsAgentRef.current = null;
    }

    function onStartInspectingNative() {
      setIsInspecting(true);
    }

    function onStopInspectingNative() {
      setIsInspecting(false);
    }

    function _attachToDevtools(agent: Object) {
      devToolsAgent = agent;
      devToolsAgentRef.current = agent;
      agent.addListener('hideNativeHighlight', onAgentHideNativeHighlight);
      agent.addListener('showNativeHighlight', onAgentShowNativeHighlight);
      agent.addListener('shutdown', cleanup);
      agent.addListener('startInspectingNative', onStartInspectingNative);
      agent.addListener('stopInspectingNative', onStopInspectingNative);
    }

    hook.on('react-devtools', _attachToDevtools);
    if (hook.reactDevtoolsAgent) {
      _attachToDevtools(hook.reactDevtoolsAgent);
    }
    return () => {
      hook.off('react-devtools', _attachToDevtools);
      cleanup();
    };
  }, []);

  const findViewForTouchEvent = useCallback(
    (e: PressEvent) => {
      const agent = devToolsAgentRef.current;
      if (agent == null) {
        return;
      }
      const {locationX, locationY} = e.nativeEvent.touches[0];
      getInspectorDataForViewAtPoint(
        inspectedView,
        locationX,
        locationY,
        viewData => {
          const {touchedViewTag, closestInstance, frame} = viewData;
          if (closestInstance != null || touchedViewTag != null) {
            if (closestInstance != null) {
              // Fabric
              agent.selectNode(closestInstance);
            } else {
              agent.selectNode(findNodeHandle(touchedViewTag));
            }
            setInspected({
              frame,
            });
            return true;
          }
          return false;
        },
      );
    },
    [inspectedView],
  );

  const onResponderRelease = useCallback(() => {
    const agent = devToolsAgentRef.current;
    if (agent == null) {
      return;
    }
    agent.stopInspectingNative(true);
    setIsInspecting(false);
    setInspected(null);
  }, []);

  const shouldSetResponser = useCallback(
    (e: PressEvent): boolean => {
      findViewForTouchEvent(e);
      return true;
    },
    [findViewForTouchEvent],
  );

  let highlight = inspected ? <ElementBox frame={inspected.frame} /> : null;
  if (isInspecting) {
    return (
      <View
        onStartShouldSetResponder={shouldSetResponser}
        onResponderMove={findViewForTouchEvent}
        onResponderRelease={onResponderRelease}
        nativeID="devToolsInspectorOverlay"
        style={[styles.inspector, {height: Dimensions.get('window').height}]}>
        {highlight}
      </View>
    );
  }
  return highlight;
}

const styles = StyleSheet.create({
  inspector: {
    backgroundColor: 'transparent',
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
  },
});
