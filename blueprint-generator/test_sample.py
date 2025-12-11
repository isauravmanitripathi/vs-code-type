# Importing necessary libraries for data handling
import pandas as pd
import numpy as np

# Setting the random seed for reproducibility
SEED = 42
np.random.seed(SEED)

def calculate_mean(data):
    """
    Calculates the mean of the input data array.
    This function serves as a basic statistical operation
    that we'll use throughout our analysis.
    """
    total = sum(data)
    count = len(data)
    return total / count

def process_results(results):
    """
    Processes the results and returns formatted output.
    We apply filtering and transformation to clean the data
    before returning the final processed result.
    """
    filtered = [x for x in results if x > 0]  # Filter positive values
    normalized = [x / max(filtered) for x in filtered]  # Normalize
    return normalized

# Main execution block
if __name__ == '__main__':
    data = [1, 2, 3, 4, 5]
    print(calculate_mean(data))
