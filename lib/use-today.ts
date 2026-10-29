'use client';

import { useEffect, useState } from 'react';
import { todayISO } from './format';

/**
 * Today's date in the visitor's timezone. Returns '' during server render and the first
 * client render so the markup always matches, then fills in right after mount.
 */
export function useToday(): string {
  const [today, setToday] = useState('');
  useEffect(() => setToday(todayISO()), []);
  return today;
}
