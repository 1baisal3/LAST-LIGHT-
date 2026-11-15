from django.urls import path

from .views import LatestReleaseView, ReleaseDetailView

urlpatterns = [
    path('datasets/latest/', LatestReleaseView.as_view(), name='dataset-latest'),
    path('datasets/<str:dataset_id>/', ReleaseDetailView.as_view(), name='dataset-detail'),
]
