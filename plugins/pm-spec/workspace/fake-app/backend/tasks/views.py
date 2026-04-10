from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Task, Comment
from .serializers import TaskSerializer, CommentSerializer
from .permissions import IsOwnerOrReadOnly, IsTeamMember


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsTeamMember]
    filterset_fields = ["status", "priority", "assignee", "project"]
    ordering_fields = ["created_at", "due_date", "priority"]

    def get_queryset(self):
        user = self.request.user
        team_ids = user.teams.values_list("id", flat=True)
        return (
            Task.objects
            .filter(project__team_id__in=team_ids)
            .select_related("assignee", "project")
            .prefetch_related("comments")
        )

    # NOTE: no pagination configured — returns all tasks in one response.
    # For teams with 1000+ tasks this will be very slow.

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        task = self.get_object()
        if request.method == "GET":
            comments = task.comments.select_related("author").all()
            serializer = CommentSerializer(comments, many=True)
            return Response(serializer.data)

        serializer = CommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(author=request.user, task=task)
        # TODO: create a Notification for the task assignee & creator
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # TODO: add endpoint for bulk status update (e.g., mark multiple tasks done)
    # TODO: add task search endpoint with full-text search


class CommentViewSet(viewsets.ModelViewSet):
    """Standalone comment endpoints — currently only supports create and list."""
    serializer_class = CommentSerializer
    permission_classes = [IsOwnerOrReadOnly]
    http_method_names = ["get", "post"]  # no PUT/PATCH/DELETE yet

    def get_queryset(self):
        return Comment.objects.select_related("author").filter(
            task__project__team__in=self.request.user.teams.all()
        )

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
