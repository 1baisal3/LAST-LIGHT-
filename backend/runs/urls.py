from rest_framework.routers import DefaultRouter

from .views import SavedScenarioViewSet

router = DefaultRouter()
router.register('scenarios', SavedScenarioViewSet, basename='scenario')
router.register('runs', SavedScenarioViewSet, basename='run')

urlpatterns = router.urls
