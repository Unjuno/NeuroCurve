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
