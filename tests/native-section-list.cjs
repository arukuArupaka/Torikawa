// Render list contents for interaction tests; real virtualization is checked in the browser/device.
const React = require('react');
module.exports = function SectionList(props) {
  return React.createElement('SectionList', props,
    props.ListHeaderComponent,
    props.sections.map((section) => React.createElement(React.Fragment, { key: section.key },
      props.renderSectionHeader?.({ section }),
      section.data.map((item, index) => React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index, section }))),
      props.renderSectionFooter?.({ section }))),
    props.ListFooterComponent);
};
