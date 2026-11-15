from rest_framework import mixins, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from .models import SavedScenario
from .serializers import SavedScenarioRenameSerializer, SavedScenarioSerializer
from mission_control.schema_tools import extend_schema, extend_schema_view


HISTORY_LIMIT = 50


class ScenarioPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 50


@extend_schema_view(
    list=extend_schema(tags=['Runs'], description='Own saved scenarios, newest first, at most 50 per page.'),
    retrieve=extend_schema(tags=['Runs'], description='Read an owned scenario; foreign IDs return 404.'),
    create=extend_schema(tags=['Runs'], description='Save a scenario; the authenticated user is always the owner.'),
    destroy=extend_schema(tags=['Runs'], description='Delete an owned scenario; foreign IDs return 404.'),
    partial_update=extend_schema(tags=['Runs'], description='Rename an owned scenario; only name can change.'),
)
class SavedScenarioViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SavedScenarioSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ScenarioPagination
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SavedScenario.objects.none()
        return SavedScenario.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return SavedScenarioRenameSerializer
        return SavedScenarioSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        keep = SavedScenario.objects.filter(user=self.request.user).values_list('pk', flat=True)[:HISTORY_LIMIT]
        SavedScenario.objects.filter(user=self.request.user).exclude(pk__in=list(keep)).delete()
