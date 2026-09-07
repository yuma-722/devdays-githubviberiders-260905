namespace Survey.Tests;

public sealed class AggregationTests
{
    [Fact]
    public void EmptyResultsIncludeAllKeys()
    {
        SurveyResults results = SurveyAggregator.Aggregate([]);
        Assert.Equal(0, results.TotalResponses);
        Assert.Equal(7, results.JobRole.Count);
        Assert.Equal(5, results.EventRating.Distribution.Count);
        Assert.All(results.JobRole.Values, count => Assert.Equal(0, count));
        Assert.All(results.EventRating.Distribution.Values, count => Assert.Equal(0, count));
        Assert.Equal(0, results.EventRating.Average);
        Assert.Empty(results.Feedback);
    }

    [Fact]
    public void CountsJobRoleSelectionsOnce()
    {
        SurveyDocument first = TestData.Document(5, "良いイベント") with
        {
            JobRole = [SurveyOptions.JobRoles[0], SurveyOptions.JobRoles[0], SurveyOptions.OtherJobRole],
            JobRoleOther = "講師"
        };
        SurveyDocument second = TestData.Document(1, " \r\n");
        SurveyDocument third = TestData.Document(3, "");
        SurveyResults results = SurveyAggregator.Aggregate([first, second, third]);
        Assert.Equal(3, results.TotalResponses);
        Assert.Equal(3, results.JobRole[SurveyOptions.JobRoles[0]]);
        Assert.Equal(1, results.JobRole[SurveyOptions.OtherJobRole]);
        Assert.Equal(3, results.EventRating.Average);
        Assert.Equal(1, results.EventRating.Distribution["1"]);
        Assert.Equal(1, results.EventRating.Distribution["3"]);
        Assert.Equal(1, results.EventRating.Distribution["5"]);
        FeedbackResult feedback = Assert.Single(results.Feedback);
        Assert.Equal(first.Id, feedback.Id);
        Assert.Equal(first.CreatedAt, feedback.Timestamp);
        Assert.Equal(DateTimeKind.Utc, feedback.Timestamp.Kind);
    }

    [Fact]
    public void CorruptStoredDataIsNotSilentlySkipped()
    {
        Assert.Throws<InvalidDataException>(() =>
            SurveyAggregator.Aggregate([TestData.Document() with { EventRating = 9 }]));
    }
}
