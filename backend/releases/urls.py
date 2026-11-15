from django.urls import path

from .views import LatestReleaseView, PointSiteView, ReleaseDetailView

urlpatterns = [
    path('datasets/latest/', LatestReleaseView.as_view(), name='dataset-latest'),
    path('datasets/<str:dataset_id>/', ReleaseDetailView.as_view(), name='dataset-detail'),
    path('datasets/<str:dataset_id>/point/', PointSiteView.as_view(), name='dataset-point'),
]
