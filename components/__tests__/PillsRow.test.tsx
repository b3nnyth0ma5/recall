import React from 'react';
import { render } from '@testing-library/react-native';
import PillsRow, { PillItem } from '../PillsRow';

const mockItems: PillItem[] = [
  { id: '1', label: 'Cooking', iconUrl: 'https://imagedelivery.net/abc/def/public', count: 12 },
  { id: '2', label: 'Travel', iconUrl: 'https://imagedelivery.net/abc/ghi/public', count: 5 },
  { id: '3', label: 'No Icon' },
];

describe('PillsRow', () => {
  it('renders an Image for each pill that has an iconUrl', () => {
    const { queryAllByRole } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    // Pills with iconUrl should render an Image
    const images = queryAllByRole('image');
    expect(images.length).toBe(2); // only items 1 and 2 have iconUrl
  });

  it('renders the correct iconUrl as the Image source', () => {
    const { getByTestId } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    // testID="pill-icon-1" is set on the Image in PillsRow when iconUrl is present
    const icon = getByTestId('pill-icon-1');
    expect(icon.props.source).toEqual({ uri: 'https://imagedelivery.net/abc/def/public' });
  });

  it('renders count badges for pills with a count', () => {
    const { getByText } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    expect(getByText('12')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('does not render an Image for pills without iconUrl', () => {
    const { queryByTestId } = render(
      <PillsRow items={mockItems} onSelect={() => {}} selectedId={null} />
    );
    expect(queryByTestId('pill-icon-3')).toBeNull();
  });
});
