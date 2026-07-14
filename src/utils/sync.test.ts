import { LocalStore, syncOfflineQueue } from './sync';

describe('Offline Sync Queue Tests', () => {
  beforeEach(() => {
    LocalStore.clearAll();
  });

  test('enqueues and dequeues queue items correctly', () => {
    const id = LocalStore.enqueue('INSERT_ENTRY', {
      foodId: 'food_123',
      kcal: 350,
      clientId: 'unique_client_id_1',
    });

    const queue = LocalStore.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe('unique_client_id_1');
    expect(queue[0].payload.kcal).toBe(350);

    LocalStore.dequeue(id);
    expect(LocalStore.getQueue().length).toBe(0);
  });

  test('successfully synchronizes queued actions to the server', async () => {
    // Mock global fetch
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch as any;

    LocalStore.enqueue('INSERT_ENTRY', {
      foodId: 'food_123',
      kcal: 350,
      clientId: 'unique_client_id_1',
    });
    LocalStore.enqueue('UPSERT_WEIGHT', {
      weightKg: 80.5,
      date: '2026-07-01',
      id: 'weight_123',
    });

    const syncSuccess = await syncOfflineQueue('mock_token');
    expect(syncSuccess).toBe(true);
    expect(LocalStore.getQueue().length).toBe(0); // Dequeued after successful sync
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
