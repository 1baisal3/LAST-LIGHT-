from rest_framework.routers import DefaultRouter

from .views import SavedScenarioViewSet

router = DefaultRouter()
router.register('scenarios', SavedScenarioViewSet, basename='scenario')

urlpatterns = router.urls
