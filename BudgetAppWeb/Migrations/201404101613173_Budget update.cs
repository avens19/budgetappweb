namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class Budgetupdate : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Budgets", "DateUpdated", c => c.DateTime(nullable: false));
        }
        
        public override void Down()
        {
            AlterColumn("dbo.Budgets", "DateUpdated", c => c.DateTime());
        }
    }
}
