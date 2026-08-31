'use client';

import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

/** Centered "verifying session" placeholder shown while auth routes resolve state. */
export const AuthPending: React.FC<{ label?: string }> = ({ label = 'Checking session…' }) => {
  return <LoadingSpinner label={label} />;
};
