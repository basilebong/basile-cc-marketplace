from rest_framework import viewsets, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import User, Team, Project
from .serializers import UserSerializer, TeamSerializer, ProjectSerializer


class UserMeView(generics.RetrieveUpdateAPIView):
    """Return or update the currently authenticated user's profile."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class TeamViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.teams.prefetch_related("members").all()

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        team = self.get_object()
        serializer = UserSerializer(team.members.all(), many=True)
        return Response(serializer.data)

    # TODO: add invite-member endpoint (POST /teams/:id/invite/)
    # TODO: add remove-member endpoint
    # TODO: add team settings update (name, slug)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user_team_ids = self.request.user.teams.values_list("id", flat=True)
        return Project.objects.filter(team_id__in=user_team_ids).select_related("team")

    def perform_create(self, serializer):
        # Ensure user belongs to the target team
        team = serializer.validated_data["team"]
        if not self.request.user.teams.filter(id=team.id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not a member of this team.")
        serializer.save()
