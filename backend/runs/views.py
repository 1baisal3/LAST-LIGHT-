from rest_framework import mixins, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from .models import SavedScenario
from .serializers import SavedScenarioSerializer
from mission_control.schema_tools import extend_schema, extend_schema_view


class ScenarioPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 50


@extend_schema_view(
    list=extend_schema(tags=['Runs'], description='Own saved scenarios, newest first, at most 50 per page.'),
    retrieve=extend_schema(tags=['Runs'], description='Read an owned scenario; foreign IDs return 404.'),
    create=extend_schema(tags=['Runs'], description='Save a scenario; the authenticated user is always the owner.'),
    destroy=extend_schema(tags=['Runs'], description='Delete an owned scenario; foreign IDs return 404.'),
)
class SavedScenarioViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SavedScenarioSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ScenarioPagination

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SavedScenario.objects.none()
        return SavedScenario.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
