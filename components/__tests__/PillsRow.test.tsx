import React from 'react';
import { render } from '@testing-library/react-native';
import PillsRow, { PillItem } from '../PillsRow';

const mockItems: PillItem[] = [
  { id: '1', label: 'Cooking', count: 12 },
  { id: '2', label: 'Travel', count: 5 },
  { id: '3', label: 'No Count' },
];

describe('PillsRow', () => {
  it('renders pill labels', () => {
    const { getByText } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    expect(getByText('Cooking')).toBeTruthy();
  });

  it('renders count badges for pills with a count', () => {
    const { getByText } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    expect(getByText('12')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });
});
