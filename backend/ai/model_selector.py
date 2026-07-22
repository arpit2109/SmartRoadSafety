from typing import Optional
from ai.model_loader import load_default

def select_best_model(category: Optional[str] = None):
    """
    Selects the best model for a given category.
    If category is provided, loads the default model for that category.
    If no category is provided, this could later be enhanced with a scene classifier.
    For now, defaults to 'vehicle' if None is provided.
    """
    if category is None:
        category = "vehicle"
        
    try:
        model = load_default(category)
        return model
    except Exception as e:
        # Fallback to vehicle if something goes wrong, or propagate
        raise RuntimeError(f"Could not select model for category '{category}': {e}")
