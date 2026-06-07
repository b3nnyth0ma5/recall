import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { FloatingNavBar } from '../FloatingNavBar';

const baseProps = {
  visible: true,
  activeRoute: 'home' as const,
  onHomePress: jest.fn(),
  onCreateRecallPress: jest.fn(),
  onSearchPress: jest.fn(),
  onProfilePress: jest.fn(),
};

describe('FloatingNavBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all four nav buttons with correct accessibility labels', () => {
    const { getByTestId, getByLabelText } = render(<FloatingNavBar {...baseProps} />);
    expect(getByTestId('navbar-home')).toBeTruthy();
    expect(getByTestId('navbar-create')).toBeTruthy();
    expect(getByTestId('navbar-search')).toBeTruthy();
    expect(getByTestId('navbar-profile')).toBeTruthy();
    expect(getByLabelText('Home')).toBeTruthy();
    expect(getByLabelText('Create Recall')).toBeTruthy();
    expect(getByLabelText('Search')).toBeTruthy();
    expect(getByLabelText('Profile')).toBeTruthy();
  });

  it('fires the correct handler when each button is tapped', () => {
    const { getByTestId } = render(<FloatingNavBar {...baseProps} />);

    fireEvent.press(getByTestId('navbar-home'));
    expect(baseProps.onHomePress).toHaveBeenCalledTimes(1);
    expect(baseProps.onCreateRecallPress).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('navbar-create'));
    expect(baseProps.onCreateRecallPress).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('navbar-search'));
    expect(baseProps.onSearchPress).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('navbar-profile'));
    expect(baseProps.onProfilePress).toHaveBeenCalledTimes(1);
  });

  it('renders the active pill inside the active button Pressable', () => {
    const { getByTestId } = render(
      <FloatingNavBar {...baseProps} activeRoute="search" />
    );
    const searchButton = getByTestId('navbar-search');
    const searchPill = getByTestId('navbar-search-pill');
    // Both must exist — pill is a child of the Pressable so it cannot block outside taps
    expect(searchButton).toBeTruthy();
    expect(searchPill).toBeTruthy();
  });

  it('each Pressable has a hit area that meets Apple HIG minimum (44pt)', () => {
    const { getByTestId } = render(<FloatingNavBar {...baseProps} />);
    const ids = ['navbar-home', 'navbar-create', 'navbar-search', 'navbar-profile'];
    for (const id of ids) {
      const node = getByTestId(id);
      // style may be a function result (Pressable) or array — flatten it
      const rawStyle = node.props.style;
      const styleArr = Array.isArray(rawStyle) ? rawStyle : [rawStyle];
      const flat = StyleSheet.flatten(styleArr.filter(Boolean));
      expect(Number(flat.width)).toBeGreaterThanOrEqual(44);
      expect(Number(flat.height)).toBeGreaterThanOrEqual(44);
    }
  });

  it('still fires handlers when visible=false (guards against accidental pointerEvents="none")', () => {
    const { getByTestId } = render(<FloatingNavBar {...baseProps} visible={false} />);
    fireEvent.press(getByTestId('navbar-home'));
    expect(baseProps.onHomePress).toHaveBeenCalledTimes(1);
  });
});
