/** True while the admin is looking at the app as another person. Changes are refused until they exit. */
let viewOnly = false;
export const setViewOnly = (on: boolean): void => {
  viewOnly = on;
};
export const isViewOnly = (): boolean => viewOnly;
export const VIEW_ONLY_MESSAGE = 'You are viewing as another person. This is read-only: exit "View as" to make changes.';
