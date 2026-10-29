# Third-party notices

## Digits dataset
E. Alpaydin and C. Kaynak (1998). Optical Recognition of Handwritten Digits.
UCI Machine Learning Repository. DOI: 10.24432/C50P49.
Source: https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits
License: Creative Commons Attribution 4.0 International (CC BY 4.0).
License text: https://creativecommons.org/licenses/by/4.0/legalcode

This distribution contains the 1,797-sample, 8×8 subset available through scikit-learn `load_digits`, converted to compact JSON. Each row has 64 integer pixel features and a class label. Pixel values are divided by 16 at runtime; the packaged source values are unscaled. The authors and data provider do not endorse NeuroCurve. Attribution must be preserved when redistributing the dataset.

Data SHA-256: f984821d12b8b038b539d9ce08387af6ec203cb77e86039f8bb5c25226d2a3ac

## Methods
PCHIP coefficients are independently implemented from the shape-preserving Hermite interpolation method, and tested against SciPy. Reference: F. N. Fritsch and J. Butland (1984), DOI: 10.1137/0905021. SciPy is used only in development verification, not bundled or imported at runtime.

MLP forward/backpropagation and Adam are implemented locally, with no external machine-learning runtime dependency. Reference: D. P. Kingma and J. Ba, Adam, arXiv:1412.6980. PyTorch is used only to verify exported code, not included in this distribution.

System fonts are referenced by CSS; no font binaries are bundled. No third-party analytics/CDN scripts are loaded.

## Added UCI standard tabular datasets (v1.0 candidate)

These are bundled from scikit-learn loader arrays and converted to compact JSON with
numeric features and zero-based target classes. Original UCI datasets are used
under Creative Commons Attribution 4.0 International (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/legalcode

- **Iris** — R. A. Fisher (1936), UCI Machine Learning Repository,
  DOI: 10.24432/C56C76, https://archive.ics.uci.edu/dataset/53/iris.
  150 records, four numeric features, three flower species.
  Derived JSON SHA-256: dc718bd91e03ac9821a46330c798d75d14a45128236a773f68e7911cf211c9f8.
- **Wine** — S. Aeberhard & M. Forina (1992), UCI Machine Learning Repository,
  DOI: 10.24432/C5PC7J, https://archive.ics.uci.edu/dataset/109/wine.
  178 records, 13 chemical features, three cultivars.
  Derived JSON SHA-256: 87b9dae4ade42f3b0c03a17508471b2fa0fd4d6c53b2582dd4ee4004bf2106e5.
- **Breast Cancer Wisconsin (Diagnostic)** — W. Wolberg, O. Mangasarian,
  N. Street & W. Street (1993), UCI Machine Learning Repository,
  DOI: 10.24432/C5DW2B,
  https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic.
  569 records, 30 nuclear morphology features, two classes.
  Derived JSON SHA-256: c6c378a8c3e796c65dbf88317d0e6c89930f9c8e714c8cffb9c1b97dd84707e0.

The authors and dataset sources do not endorse NeuroCurve. These small datasets are
educational benchmark examples; WDBC results are NOT clinical diagnostic claims.
Preprocessing and split generation occur on-device and are based solely on the
training split. The full source observations are bundled; class labels are
zero-based and original feature values are retained to eight decimal places.
