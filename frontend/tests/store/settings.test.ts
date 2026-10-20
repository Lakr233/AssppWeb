import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../../src/store/settings';

describe('store/settings', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the zustand store
    useSettingsStore.setState({
      defaultCountry: 'US',
      defaultEntity: 'iPhone',
    });
  });

  it('should have default country US', () => {
    const state = useSettingsStore.getState();
    expect(state.defaultCountry).toBe('US');
  });

  it('should have default entity iPhone', () => {
    const state = useSettingsStore.getState();
    expect(state.defaultEntity).toBe('iPhone');
  });

  it('should update default country', () => {
    useSettingsStore.getState().setDefaultCountry('GB');
    expect(useSettingsStore.getState().defaultCountry).toBe('GB');
  });

  it('should update default entity', () => {
    useSettingsStore.getState().setDefaultEntity('iPad');
    expect(useSettingsStore.getState().defaultEntity).toBe('iPad');
  });
});
