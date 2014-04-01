namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class addbudgetname : DbMigration
    {
        public override void Up()
        {
            AddColumn("dbo.Budgets", "Name", c => c.String(nullable: false, defaultValue: "My"));
        }
        
        public override void Down()
        {
            DropColumn("dbo.Budgets", "Name");
        }
    }
}
