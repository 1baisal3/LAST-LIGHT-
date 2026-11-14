from django.urls import path

from .views import FixPlanView, MissionSimulationView

urlpatterns = [
    path('mission/', MissionSimulationView.as_view(), name='mission-simulation'),
    path('mission/fix-plan/', FixPlanView.as_view(), name='mission-fix-plan'),
]
