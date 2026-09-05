namespace Survey.Storage;

public interface ISurveyRepository
{
    Task AddAsync(SurveyDocument survey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SurveyDocument>> GetAllAsync(CancellationToken cancellationToken = default);
}
