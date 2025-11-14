
import React, { useState, useEffect } from 'react';
import { Text, TextStyle } from 'react-native';

interface TimeAgoProps {
  date: string | Date;
  style?: TextStyle;
}

export function TimeAgo({ date, style }: TimeAgoProps) {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const updateTimeAgo = () => {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const now = new Date();
      const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

      let interval = seconds / 31536000; // years
      if (interval > 1) {
        const years = Math.floor(interval);
        setTimeAgo(`${years} year${years > 1 ? 's' : ''} ago`);
        return;
      }

      interval = seconds / 2592000; // months
      if (interval > 1) {
        const months = Math.floor(interval);
        setTimeAgo(`${months} month${months > 1 ? 's' : ''} ago`);
        return;
      }

      interval = seconds / 86400; // days
      if (interval > 1) {
        const days = Math.floor(interval);
        setTimeAgo(`${days} day${days > 1 ? 's' : ''} ago`);
        return;
      }

      interval = seconds / 3600; // hours
      if (interval > 1) {
        const hours = Math.floor(interval);
        setTimeAgo(`${hours} hour${hours > 1 ? 's' : ''} ago`);
        return;
      }

      interval = seconds / 60; // minutes
      if (interval > 1) {
        const minutes = Math.floor(interval);
        setTimeAgo(`${minutes} minute${minutes > 1 ? 's' : ''} ago`);
        return;
      }

      if (seconds < 10) {
        setTimeAgo('just now');
      } else {
        setTimeAgo(`${Math.floor(seconds)} seconds ago`);
      }
    };

    updateTimeAgo();
    
    // Update every minute
    const intervalId = setInterval(updateTimeAgo, 60000);

    return () => clearInterval(intervalId);
  }, [date]);

  return <Text style={style}>{timeAgo}</Text>;
}
