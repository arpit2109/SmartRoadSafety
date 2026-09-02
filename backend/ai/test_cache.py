from django.test import TestCase
from ai.cache import ModelCache
from unittest.mock import MagicMock
import concurrent.futures

class ModelCacheTests(TestCase):
    def setUp(self):
        self.cache = ModelCache()
        
    def test_cache_set_get(self):
        mock_model = MagicMock()
        self.cache.set("test_key", mock_model)
        self.assertEqual(self.cache.get("test_key"), mock_model)
        
    def test_cache_clear(self):
        mock_model = MagicMock()
        self.cache.set("test_key", mock_model)
        self.cache.clear()
        self.assertIsNone(self.cache.get("test_key"))
        
    def test_concurrent_access(self):
        def worker(i):
            self.cache.set(f"key_{i}", i)
            return self.cache.get(f"key_{i}")

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(worker, range(10)))
        
        self.assertEqual(results, list(range(10)))
        stats = self.cache.stats()
        self.assertEqual(stats["loads"], 10)
