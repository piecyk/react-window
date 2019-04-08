// @flow

import { createElement } from 'react';

import createListComponent, { defaultItemKey } from './createListComponent';
import ItemMeasurer from './ItemMeasurer';

import type { Props, ScrollToAlign } from './createListComponent';

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;

type DynanmicProps = {|
  estimatedItemSize: number,
  ...Props<any>,
|};

export type HandleNewMeasurements = (
  index: number,
  newSize: number,
  isFirstMeasureAfterMounting: boolean
) => void;

type ItemMetadata = {|
  offset: number,
  size: number,
|};
type InstanceProps = {|
  estimatedItemSize: number,
  instance: any,
  itemSizeMap: { [index: number]: number },

  // TODO:
  anchorIndex: number,
  anchorSizeDelta: number,
  stopIndex: number,
|};

const getItemMetadata = (
  props: Props<any>,
  index: number,
  instanceProps: InstanceProps
): ItemMetadata => {
  const {
    estimatedItemSize,
    instance,
    itemSizeMap,
    anchorIndex,
    stopIndex,
  } = instanceProps;

  const size = itemSizeMap[index] || estimatedItemSize;

  // FIXME don't clear cache for every render
  if (instance._itemStyleCache) {
    delete instance._itemStyleCache[index];
  }

  let offset = anchorIndex * estimatedItemSize;

  if (index > anchorIndex && index <= stopIndex) {
    for (let i = anchorIndex; i < index; i++) {
      offset += itemSizeMap[i] || estimatedItemSize;
    }
    return { offset, size };
  } else {
    return { offset, size };
  }
};

const getEstimatedTotalSize = (
  { itemCount }: Props<any>,
  { itemSizeMap, estimatedItemSize, anchorIndex, stopIndex }: InstanceProps
) => {
  let totalMeasuredSize = 0;
  let rendered = 0;
  for (let i = anchorIndex; i <= stopIndex; i++) {
    totalMeasuredSize += itemSizeMap[i] || estimatedItemSize;
    rendered++;
  }
  const restSize = (itemCount - rendered) * estimatedItemSize;
  const nextSize = restSize + totalMeasuredSize;

  return nextSize;
};

const DynamicSizeList = createListComponent({
  getItemOffset: (
    props: Props<any>,
    index: number,
    instanceProps: InstanceProps
  ): number => getItemMetadata(props, index, instanceProps).offset,

  getItemSize: (
    props: Props<any>,
    index: number,
    instanceProps: InstanceProps
  ): ?number => {
    // Do not hard-code item dimensions.
    // We don't know them initially.
    // Even once we do, changes in item content or list size should reflow.
    return undefined;
  },

  getEstimatedTotalSize,

  getOffsetForIndexAndAlignment: (
    props: Props<any>,
    index: number,
    align: ScrollToAlign,
    scrollOffset: number,
    instanceProps: InstanceProps
  ): number => {
    // TODO: align start is only supported ?
    instanceProps.anchorIndex = index;
    return index * instanceProps.estimatedItemSize;

    // const { direction, layout, height, width } = props;

    // if (process.env.NODE_ENV !== 'production') {
    //   const { lastMeasuredIndex } = instanceProps;
    //   if (index > lastMeasuredIndex) {
    //     console.warn(
    //       `DynamicSizeList does not support scrolling to items that yave not yet measured. ` +
    //         `scrollToItem() was called with index ${index} but the last measured item was ${lastMeasuredIndex}.`
    //     );
    //   }
    // }

    // const size = (((direction === 'horizontal' || layout === 'horizontal'
    //   ? width
    //   : height): any): number);
    // const itemMetadata = getItemMetadata(props, index, instanceProps);

    // // Get estimated total size after ItemMetadata is computed,
    // // To ensure it reflects actual measurements instead of just estimates.
    // const estimatedTotalSize = getEstimatedTotalSize(props, instanceProps);

    // const maxOffset = Math.min(estimatedTotalSize - size, itemMetadata.offset);
    // const minOffset = Math.max(
    //   0,
    //   itemMetadata.offset - size + itemMetadata.size
    // );

    // switch (align) {
    //   case 'start':
    //     return maxOffset;
    //   case 'end':
    //     return minOffset;
    //   case 'center':
    //     return Math.round(minOffset + (maxOffset - minOffset) / 2);
    //   case 'auto':
    //   default:
    //     if (scrollOffset >= minOffset && scrollOffset <= maxOffset) {
    //       return scrollOffset;
    //     } else if (scrollOffset - minOffset < maxOffset - scrollOffset) {
    //       return minOffset;
    //     } else {
    //       return maxOffset;
    //     }
    // }
  },

  getStartIndexForOffset: (
    props: Props<any>,
    offset: number,
    instanceProps: InstanceProps
  ): number => {
    const { itemCount } = props;
    const { estimatedItemSize, itemSizeMap, instance } = instanceProps;
    let { anchorIndex: index, anchorSizeDelta: sizeDelta } = instanceProps;

    const offsetIndex = index * estimatedItemSize;
    let delta = offset - offsetIndex;

    const getSize = (i: number) => itemSizeMap[i] || estimatedItemSize;

    if (instance.state.scrollDirection === 'backward') {
      while (delta < 0) {
        index = Math.max(0, index - 1);
        const nextSize = getSize(index);
        sizeDelta -= estimatedItemSize - nextSize;
        delta += nextSize;
      }
    } else {
      while (delta > getSize(index)) {
        const nextSize = getSize(index);
        sizeDelta += estimatedItemSize - nextSize;
        delta -= nextSize;
        index = Math.min(itemCount - 1, index + 1);
      }
    }

    instanceProps.anchorIndex = index;
    instanceProps.anchorSizeDelta = sizeDelta;

    return instanceProps.anchorIndex;
  },

  getStopIndexForStartIndex: (
    props: Props<any>,
    startIndex: number,
    scrollOffset: number,
    instanceProps: InstanceProps
  ): number => {
    const { direction, layout, height, itemCount, width } = props;

    const size = (((direction === 'horizontal' || layout === 'horizontal'
      ? width
      : height): any): number);
    const itemMetadata = getItemMetadata(props, startIndex, instanceProps);
    const maxOffset = scrollOffset + size;

    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex < itemCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += getItemMetadata(props, stopIndex, instanceProps).size;
    }

    return stopIndex;
  },

  initInstanceProps(props: Props<any>, instance: any): InstanceProps {
    const { estimatedItemSize } = ((props: any): DynanmicProps);

    const instanceProps = {
      estimatedItemSize: estimatedItemSize || DEFAULT_ESTIMATED_ITEM_SIZE,
      instance,
      itemSizeMap: {},
      anchorIndex: 0,
      anchorSizeDelta: 0,
      // TODO:
      stopIndex: 0,
    };

    let debounceForceUpdateID = null;
    const debounceForceUpdate = () => {
      if (debounceForceUpdateID === null) {
        debounceForceUpdateID = setTimeout(() => {
          debounceForceUpdateID = null;
          instance.forceUpdate();
        }, 1);
      }
    };

    // This method is called before unmounting.
    instance._unmountHook = () => {
      if (debounceForceUpdateID !== null) {
        clearTimeout(debounceForceUpdateID);
        debounceForceUpdateID = null;
      }
    };

    let hasNewMeasurements: boolean = false;

    // This method is called after mount and update.
    instance._commitHook = () => {
      const anchorSizeDeltaForStateUpdate = instanceProps.anchorSizeDelta;

      if (anchorSizeDeltaForStateUpdate !== 0) {
        instanceProps.anchorSizeDelta -= anchorSizeDeltaForStateUpdate;

        instance.setState(
          prevState => {
            return {
              scrollOffset:
                prevState.scrollOffset + anchorSizeDeltaForStateUpdate,
            };
          },
          () => {
            const { scrollOffset } = instance.state;
            const { direction, layout } = instance.props;
            const isHorizontal =
              direction === 'horizontal' || layout === 'horizontal';
            // Adjusting scroll offset directly interrupts smooth scrolling for some browsers (e.g. Firefox).
            // The relative scrollBy() method doesn't interrupt (or at least it won't as of Firefox v65).
            // Other browsers (e.g. Chrome, Safari) seem to handle both adjustments equally well.
            // See https://bugzilla.mozilla.org/show_bug.cgi?id=1502059
            const element = ((instance._outerRef: any): HTMLDivElement);
            // $FlowFixMe Property scrollBy is missing in HTMLDivElement
            if (typeof element.scrollBy === 'function') {
              element.scrollBy(
                isHorizontal ? anchorSizeDeltaForStateUpdate : 0,
                isHorizontal ? 0 : anchorSizeDeltaForStateUpdate
              );
            } else if (isHorizontal) {
              element.scrollLeft = scrollOffset;
            } else {
              element.scrollTop = scrollOffset;
            }
          }
        );
      }

      if (hasNewMeasurements) {
        hasNewMeasurements = false;

        // Edge case where cell sizes changed, but cancelled each other out.
        // We still need to re-render in this case,
        // Even though we don't need to adjust scroll offset.
        if (anchorSizeDeltaForStateUpdate === 0) {
          instance.forceUpdate();
          return;
        }
      }
    };

    // This function may be called out of order!
    // It is not safe to reposition items here.
    // Be careful when comparing index and lastMeasuredIndex.
    const handleNewMeasurements: HandleNewMeasurements = (
      index: number,
      newSize: number,
      isFirstMeasureAfterMounting: boolean
    ) => {
      const { itemSizeMap } = instanceProps;

      itemSizeMap[index] = newSize;

      if (isFirstMeasureAfterMounting) {
        hasNewMeasurements = true;
      } else {
        debounceForceUpdate();
      }
    };
    instance._handleNewMeasurements = handleNewMeasurements;

    // Override the item-rendering process to wrap items with ItemMeasurer.
    // This keep the external API simpler.
    instance._renderItems = () => {
      const {
        children,
        direction,
        layout,
        itemCount,
        itemData,
        itemKey = defaultItemKey,
        useIsScrolling,
      } = instance.props;
      const { isScrolling } = instance.state;

      const [, , startIndex, stopIndex] = instance._getRangeToRender();

      // FIXME: store on instance rendered items metadata and re-use them
      instanceProps.stopIndex = stopIndex;

      const items = [];
      if (itemCount > 0) {
        for (let index = startIndex; index <= stopIndex; index++) {
          const { size } = getItemMetadata(
            instance.props,
            index,
            instanceProps
          );

          // It's important to read style after fetching item metadata.
          // getItemMetadata() will clear stale styles.
          const style = instance._getItemStyle(index);

          const item = createElement(children, {
            data: itemData,
            index,
            isScrolling: useIsScrolling ? isScrolling : undefined,
            style,
          });

          // Always wrap children in a ItemMeasurer to detect changes in size.
          items.push(
            createElement(ItemMeasurer, {
              direction,
              layout,
              handleNewMeasurements,
              index,
              item,
              key: itemKey(index),
              size,
            })
          );
        }
      }
      return items;
    };

    return instanceProps;
  },

  shouldResetStyleCacheOnItemSizeChange: false,

  validateProps: ({ itemSize }: Props<any>): void => {
    if (process.env.NODE_ENV !== 'production') {
      if (itemSize !== undefined) {
        throw Error('An unexpected "itemSize" prop has been provided.');
      }
    }
  },
});

export default DynamicSizeList;
