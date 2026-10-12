
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def get_recommendations(products, product_id: int, limit: int = 4):
    """
    Find products similar to the selected product
    using TF-IDF and cosine similarity.
    """

    if len(products) <= 1:
        return []

    # Combine product name and description into text.
    product_texts = [
        f"{product.name} {product.description or ''}"
        for product in products
    ]

    # Convert product text into numerical vectors.
    vectorizer = TfidfVectorizer(stop_words="english")
    product_vectors = vectorizer.fit_transform(product_texts)

    # Find the selected product's position.
    target_index = next(
        (
            index
            for index, product in enumerate(products)
            if product.id == product_id
        ),
        None,
    )

    if target_index is None:
        return []

    # Calculate similarity scores against all products.
    similarity_scores = cosine_similarity(
        product_vectors[target_index],
        product_vectors,
    ).flatten()

    # Sort products from highest similarity to lowest.
    ranked_indices = similarity_scores.argsort()[::-1]

    recommendations = []

    for index in ranked_indices:
        product = products[index]

        # Do not recommend the same product.
        if product.id == product_id:
            continue

        # Only recommend products with a positive similarity score.
        if similarity_scores[index] <= 0:
            continue

        recommendations.append(product)

        if len(recommendations) >= limit:
            break

    return recommendations
